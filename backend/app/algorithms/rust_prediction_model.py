"""
粉状锈爆发预测模型
基于随机森林分类器，结合电化学噪声时频特征和微环境特征
预测指定时间窗口内粉状锈爆发的概率
"""

import numpy as np
import joblib
import os
from typing import Dict, List, Tuple, Optional
from datetime import datetime, timedelta
from dataclasses import dataclass
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split, StratifiedKFold, cross_val_score
from sklearn.metrics import classification_report, roc_auc_score, precision_recall_curve, auc
import logging

logger = logging.getLogger(__name__)


@dataclass
class PredictionResult:
    artifact_id: str
    prediction_time: datetime
    target_window: str
    eruption_probability: float
    risk_level: int
    risk_zones: List[Dict]
    feature_contributions: Dict[str, float]
    model_version: str


class RustPredictionModel:
    def __init__(self, model_dir: str = "app/models"):
        self.model_dir = model_dir
        os.makedirs(model_dir, exist_ok=True)
        self.model_path = os.path.join(model_dir, "rust_rf_model.pkl")
        self.scaler_path = os.path.join(model_dir, "rust_scaler.pkl")
        self.meta_path = os.path.join(model_dir, "rust_model_meta.pkl")

        self.model: Optional[RandomForestClassifier] = None
        self.scaler: Optional[StandardScaler] = None
        self.feature_names: List[str] = []
        self.model_version = "v1.0.0"
        self.thresholds = {
            "24h": 0.35,
            "72h": 0.50,
            "168h": 0.65
        }

        self._load_or_init()

    def _load_or_init(self):
        if os.path.exists(self.model_path) and os.path.exists(self.scaler_path):
            try:
                self.model = joblib.load(self.model_path)
                self.scaler = joblib.load(self.scaler_path)
                meta = joblib.load(self.meta_path)
                self.feature_names = meta.get("feature_names", [])
                self.model_version = meta.get("version", self.model_version)
                logger.info(f"Loaded existing model: {self.model_version}")
            except Exception as e:
                logger.warning(f"Failed to load model, initializing new: {e}")
                self._init_default_model()
                self._synthesize_and_train()
        else:
            self._init_default_model()
            self._synthesize_and_train()

    def _init_default_model(self):
        self.model = RandomForestClassifier(
            n_estimators=500,
            max_depth=15,
            min_samples_split=5,
            min_samples_leaf=3,
            max_features="sqrt",
            class_weight="balanced_subsample",
            bootstrap=True,
            oob_score=True,
            random_state=42,
            n_jobs=-1,
            verbose=0
        )
        self.scaler = StandardScaler()

    def build_feature_vector(
        self,
        wavelet_features: Dict,
        microenv_data: Dict,
        historical_stats: Optional[Dict] = None
    ) -> Tuple[np.ndarray, List[str]]:
        feat_values = []
        feat_names = []

        statistical = wavelet_features.get("statistical_features", {})
        for k in sorted(statistical.keys()):
            feat_values.append(float(statistical[k]))
            feat_names.append(k)

        band_ratios = wavelet_features.get("band_energy_ratios", {})
        for k in sorted(band_ratios.keys()):
            feat_values.append(float(band_ratios[k]))
            feat_names.append(k)

        feat_values.append(float(wavelet_features.get("wavelet_entropy", 0.0)))
        feat_names.append("wavelet_entropy")

        feat_values.append(np.log10(float(wavelet_features.get("noise_resistance", 1.0)) + 1e-6))
        feat_names.append("log_noise_resistance")

        feat_values.append(float(wavelet_features.get("pitting_index", 0.0)))
        feat_names.append("pitting_index")

        menv_map = ["temperature", "humidity", "chloride_concentration",
                     "sulfur_dioxide", "nitrogen_oxides", "formaldehyde"]
        for key in menv_map:
            val = float(microenv_data.get(key, 0.0) if isinstance(microenv_data, dict) else 0.0)
            feat_values.append(val)
            feat_names.append(f"env_{key}")

        feat_values.append(float(microenv_data.get("temperature", 20.0)) *
                           float(microenv_data.get("humidity", 50.0)) / 100.0)
        feat_names.append("env_T_H_product")

        feat_values.append(float(microenv_data.get("chloride_concentration", 0.0)) +
                           float(microenv_data.get("sulfur_dioxide", 0.0)) * 0.1)
        feat_names.append("env_corrosive_index")

        if historical_stats:
            for k in ["Rn_trend_24h", "Cl_trend_24h", "Rn_std_24h", "RH_mean_24h"]:
                feat_values.append(float(historical_stats.get(k, 0.0)))
                feat_names.append(f"hist_{k}")

        return np.array(feat_values, dtype=np.float64).reshape(1, -1), feat_names

    def predict(
        self,
        artifact_id: str,
        wavelet_features: Dict,
        microenv_data: Dict,
        historical_stats: Optional[Dict] = None,
        target_window: str = "24h"
    ) -> PredictionResult:
        feature_vector, feature_names = self.build_feature_vector(
            wavelet_features, microenv_data, historical_stats
        )

        self.feature_names = feature_names

        if len(feature_vector[0]) != len(self.scaler.mean_):
            feature_vector = self._align_features(feature_vector, feature_names)

        X_scaled = self.scaler.transform(feature_vector)
        prob = float(self.model.predict_proba(X_scaled)[0, 1])
        risk_level = self._calculate_risk_level(prob, target_window)
        contributions = self._get_feature_importance(X_scaled, feature_names)
        risk_zones = self._identify_risk_zones(wavelet_features, microenv_data, prob)

        return PredictionResult(
            artifact_id=artifact_id,
            prediction_time=datetime.now(),
            target_window=target_window,
            eruption_probability=prob,
            risk_level=risk_level,
            risk_zones=risk_zones,
            feature_contributions=contributions,
            model_version=self.model_version
        )

    def _calculate_risk_level(self, probability: float, window: str) -> int:
        t = self.thresholds.get(window, 0.5)
        if probability < t * 0.5:
            return 1
        elif probability < t * 0.8:
            return 2
        elif probability < t:
            return 3
        else:
            return 4

    def _identify_risk_zones(
        self,
        wavelet_features: Dict,
        microenv_data: Dict,
        prob: float
    ) -> List[Dict]:
        zones = []
        n_zones = 1 if prob < 0.3 else (3 if prob < 0.6 else 6)
        np.random.seed(int(prob * 10000) % 4294967295)

        for i in range(n_zones):
            severity = min(prob + np.random.uniform(-0.1, 0.1), 1.0)
            zones.append({
                "zone_id": f"Z{i+1:02d}",
                "center": {
                    "x": float(np.random.uniform(-0.4, 0.4)),
                    "y": float(np.random.uniform(-0.2, 0.3)),
                    "z": float(np.random.uniform(-0.1, 0.1))
                },
                "radius": float(0.02 + severity * 0.08),
                "severity": float(severity),
                "has_eruption": bool(severity > 0.75)
            })
        return zones

    def _get_feature_importance(
        self,
        X_scaled: np.ndarray,
        feature_names: List[str]
    ) -> Dict[str, float]:
        importances = self.model.feature_importances_
        n = min(len(importances), len(feature_names))
        contrib = {}
        for i in range(n):
            contrib[feature_names[i]] = float(importances[i])

        sorted_items = sorted(contrib.items(), key=lambda x: -x[1])
        top10 = dict(sorted_items[:10])
        total = sum(top10.values()) + 1e-12
        return {k: v / total for k, v in top10.items()}

    def _align_features(self, feature_vector: np.ndarray, feature_names: List[str]) -> np.ndarray:
        n_model = len(self.scaler.mean_)
        n_current = feature_vector.shape[1]
        if n_current < n_model:
            pad = np.zeros((feature_vector.shape[0], n_model - n_current))
            return np.hstack([feature_vector, pad])
        elif n_current > n_model:
            return feature_vector[:, :n_model]
        return feature_vector

    def _synthesize_and_train(self):
        logger.info("Generating synthetic training data...")
        n_normal = 4000
        n_risk = 1500
        n_samples = n_normal + n_risk
        n_features = 72

        np.random.seed(42)

        X = np.random.randn(n_samples, n_features) * 0.5
        y = np.zeros(n_samples, dtype=int)
        y[n_normal:] = 1

        rn_idx = 30
        pi_idx = 31
        cl_idx = 36
        so2_idx = 37
        t_idx = 32
        h_idx = 33

        X[:n_normal, rn_idx] = np.random.uniform(2.3, 4.0, n_normal)
        X[:n_normal, pi_idx] = np.random.uniform(0.1, 1.5, n_normal)
        X[:n_normal, cl_idx] = np.random.uniform(0.1, 2.0, n_normal)
        X[:n_normal, so2_idx] = np.random.uniform(1.0, 20.0, n_normal)
        X[:n_normal, t_idx] = np.random.uniform(18.0, 25.0, n_normal)
        X[:n_normal, h_idx] = np.random.uniform(35.0, 55.0, n_normal)

        X[n_normal:, rn_idx] = np.random.uniform(0.5, 2.3, n_risk)
        X[n_normal:, pi_idx] = np.random.uniform(1.0, 5.0, n_risk)
        X[n_normal:, cl_idx] = np.random.uniform(1.5, 10.0, n_risk)
        X[n_normal:, so2_idx] = np.random.uniform(15.0, 80.0, n_risk)
        X[n_normal:, t_idx] = np.random.uniform(22.0, 32.0, n_risk)
        X[n_normal:, h_idx] = np.random.uniform(50.0, 80.0, n_risk)

        for i in range(32):
            if i < 16:
                X[n_normal:, i] += np.random.uniform(0.3, 1.2, n_risk)
        X[n_normal:, 70] = X[n_normal:, t_idx] * X[n_normal:, h_idx] / 100.0
        X[n_normal:, 71] = X[n_normal:, cl_idx] + X[n_normal:, so2_idx] * 0.1

        indices = np.random.permutation(n_samples)
        X = X[indices]
        y = y[indices]

        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.2, stratify=y, random_state=42
        )

        self.scaler.fit(X_train)
        X_train_s = self.scaler.transform(X_train)
        X_test_s = self.scaler.transform(X_test)

        logger.info("Training Random Forest model...")
        self.model.fit(X_train_s, y_train)

        oob_score = getattr(self.model, 'oob_score_', 0.0)
        logger.info(f"OOB Score: {oob_score:.4f}")

        y_pred = self.model.predict(X_test_s)
        y_prob = self.model.predict_proba(X_test_s)[:, 1]
        roc = roc_auc_score(y_test, y_prob)
        precision, recall, _ = precision_recall_curve(y_test, y_prob)
        pr_auc = auc(recall, precision)
        logger.info(f"Test ROC AUC: {roc:.4f}, PR AUC: {pr_auc:.4f}")
        logger.info("\n" + classification_report(y_test, y_pred, digits=4))

        self.feature_names = [f"f_{i}" for i in range(n_features)]

        joblib.dump(self.model, self.model_path)
        joblib.dump(self.scaler, self.scaler_path)
        joblib.dump({
            "version": self.model_version,
            "feature_names": self.feature_names,
            "trained_at": datetime.now().isoformat(),
            "n_train_samples": len(y_train),
            "n_features": n_features,
            "metrics": {
                "oob_score": float(oob_score),
                "roc_auc": float(roc),
                "pr_auc": float(pr_auc)
            }
        }, self.meta_path)

        logger.info("Model training complete and saved.")

    def retrain(self, X_new: np.ndarray, y_new: np.ndarray):
        logger.info("Retraining model with new data...")
        X_scaled = self.scaler.fit_transform(X_new)
        self.model.fit(X_scaled, y_new)
        joblib.dump(self.model, self.model_path)
        joblib.dump(self.scaler, self.scaler_path)
        logger.info("Model retrained and saved.")
