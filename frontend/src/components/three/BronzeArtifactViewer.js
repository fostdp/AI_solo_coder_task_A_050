import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import TWEEN from '@tweenjs/tween.js'

export class BronzeArtifactViewer {
  constructor(container, options = {}) {
    this.container = container
    this.options = {
      backgroundColor: 0x0a0e1a,
      antialias: true,
      autoRotate: false,
      showWireframe: false,
      ...options
    }

    this.scene = null
    this.camera = null
    this.renderer = null
    this.controls = null
    this.artifactGroup = null
    this.riskZones = []
    this.eruptionParticles = []
    this.particleSystems = []
    this.animationId = null
    this.clock = new THREE.Clock()
    this.riskMaterials = []

    this._init()
  }

  _init() {
    const width = this.container.clientWidth
    const height = this.container.clientHeight

    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(this.options.backgroundColor)
    this.scene.fog = new THREE.FogExp2(this.options.backgroundColor, 0.08)

    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000)
    this.camera.position.set(1.5, 1.2, 2.0)

    this.renderer = new THREE.WebGLRenderer({
      antialias: this.options.antialias,
      alpha: true
    })
    this.renderer.setPixelRatio(window.devicePixelRatio)
    this.renderer.setSize(width, height)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.2
    this.container.appendChild(this.renderer.domElement)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.05
    this.controls.minDistance = 0.5
    this.controls.maxDistance = 10
    this.controls.target.set(0, 0.2, 0)
    this.controls.autoRotate = this.options.autoRotate
    this.controls.autoRotateSpeed = 0.5

    this._setupLights()
    this._createGround()
    this._createArtifactGroup()

    window.addEventListener('resize', () => this._onResize())
    this._animate()
  }

  _setupLights() {
    const ambient = new THREE.AmbientLight(0xffffff, 0.35)
    this.scene.add(ambient)

    const hemi = new THREE.HemisphereLight(0xffeebb, 0x112244, 0.5)
    this.scene.add(hemi)

    const keyLight = new THREE.DirectionalLight(0xfff4e0, 1.2)
    keyLight.position.set(3, 4, 2)
    keyLight.castShadow = true
    keyLight.shadow.mapSize.width = 2048
    keyLight.shadow.mapSize.height = 2048
    keyLight.shadow.camera.near = 0.1
    keyLight.shadow.camera.far = 20
    keyLight.shadow.camera.left = -3
    keyLight.shadow.camera.right = 3
    keyLight.shadow.camera.top = 3
    keyLight.shadow.camera.bottom = -3
    this.scene.add(keyLight)

    const rimLight = new THREE.DirectionalLight(0x4488ff, 0.4)
    rimLight.position.set(-2, 2, -3)
    this.scene.add(rimLight)

    const fillLight = new THREE.PointLight(0xffaa55, 0.6, 10)
    fillLight.position.set(-1, 1, 2)
    this.scene.add(fillLight)

    const spotLight = new THREE.SpotLight(0xffffff, 1.0)
    spotLight.position.set(0, 3, 0)
    spotLight.angle = Math.PI / 5
    spotLight.penumbra = 0.4
    spotLight.castShadow = true
    this.scene.add(spotLight)
  }

  _createGround() {
    const platformGeo = new THREE.CylinderGeometry(0.8, 0.9, 0.08, 64)
    const platformMat = new THREE.MeshStandardMaterial({
      color: 0x2a2018,
      roughness: 0.8,
      metalness: 0.2
    })
    const platform = new THREE.Mesh(platformGeo, platformMat)
    platform.position.y = -0.3
    platform.receiveShadow = true
    this.scene.add(platform)

    const ringGeo = new THREE.TorusGeometry(0.78, 0.01, 16, 128)
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xb87333, transparent: true, opacity: 0.6 })
    const ring = new THREE.Mesh(ringGeo, ringMat)
    ring.rotation.x = -Math.PI / 2
    ring.position.y = -0.255
    this.scene.add(ring)
  }

  _createArtifactGroup() {
    this.artifactGroup = new THREE.Group()
    this.scene.add(this.artifactGroup)
  }

  buildBronzeDing(style = 'simsimuwu') {
    this.clearArtifact()

    switch (style) {
      case 'simsimuwu': this._createSimMuWuDing(); break
      case 'siyangfangzun': this._createSiYangFangZun(); break
      case 'jue': this._createJue(); break
      case 'zhong': this._createBell(); break
      case 'jian': this._createSword(); break
      default: this._createSimMuWuDing()
    }

    if (this.options.showWireframe) {
      this.artifactGroup.traverse(obj => {
        if (obj.isMesh) {
          const wf = new THREE.WireframeGeometry(obj.geometry)
          const wfMat = new THREE.LineBasicMaterial({ color: 0xffaa55, transparent: true, opacity: 0.3 })
          obj.add(new THREE.LineSegments(wf, wfMat))
        }
      })
    }
  }

  _createBronzeMaterial(patinaLevel = 0.3) {
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(0.08, 0.4, 0.35 * (1 - patinaLevel * 0.3)),
      metalness: 0.9,
      roughness: 0.55 - patinaLevel * 0.2,
      envMapIntensity: 1.0
    })
  }

  _createGreenPatinaMaterial() {
    return new THREE.MeshStandardMaterial({
      color: 0x3c7a4d,
      metalness: 0.6,
      roughness: 0.85
    })
  }

  _createSimMuWuDing() {
    const bronze = this._createBronzeMaterial(0.4)
    const patina = this._createGreenPatinaMaterial()

    const bodyGroup = new THREE.Group()

    const bodyGeo = new THREE.BoxGeometry(0.7, 0.45, 0.5)
    const body = new THREE.Mesh(bodyGeo, bronze)
    body.position.y = 0.05
    body.castShadow = true
    body.receiveShadow = true
    bodyGroup.add(body)

    const rimGeo = new THREE.BoxGeometry(0.78, 0.06, 0.58)
    const rim = new THREE.Mesh(rimGeo, bronze)
    rim.position.y = 0.30
    rim.castShadow = true
    bodyGroup.add(rim)

    for (let i = 0; i < 4; i++) {
      const earGeo = new THREE.TorusGeometry(0.08, 0.025, 16, 32, Math.PI)
      const ear = new THREE.Mesh(earGeo, bronze)
      ear.rotation.z = Math.PI
      ear.position.set(
        i < 2 ? -0.22 : 0.22,
        0.36,
        i % 2 === 0 ? -0.18 : 0.18
      )
      ear.rotation.x = i % 2 === 0 ? 0 : Math.PI
      ear.castShadow = true
      bodyGroup.add(ear)
    }

    const legPositions = [
      [-0.25, -0.2, -0.16], [0.25, -0.2, -0.16],
      [-0.25, -0.2, 0.16], [0.25, -0.2, 0.16]
    ]
    legPositions.forEach(([x, y, z]) => {
      const legGeo = new THREE.CylinderGeometry(0.045, 0.055, 0.28, 16)
      const leg = new THREE.Mesh(legGeo, bronze)
      leg.position.set(x, y, z)
      leg.castShadow = true
      bodyGroup.add(leg)

      const footGeo = new THREE.CylinderGeometry(0.065, 0.07, 0.04, 16)
      const foot = new THREE.Mesh(footGeo, bronze)
      foot.position.set(x, y - 0.15, z)
      foot.castShadow = true
      bodyGroup.add(foot)
    })

    for (let fi = 0; fi < 50; fi++) {
      const patchGeo = new THREE.CircleGeometry(0.015 + Math.random() * 0.03, 12)
      const patch = new THREE.Mesh(patchGeo, patina)
      const side = Math.floor(Math.random() * 4)
      let px = 0, py = 0, pz = 0, rx = 0, ry = 0, rz = 0
      if (side === 0) { px = (Math.random() - 0.5) * 0.6; py = Math.random() * 0.4; pz = 0.251; ry = 0 }
      else if (side === 1) { px = (Math.random() - 0.5) * 0.6; py = Math.random() * 0.4; pz = -0.251; ry = Math.PI }
      else if (side === 2) { px = 0.351; py = Math.random() * 0.4; pz = (Math.random() - 0.5) * 0.4; ry = Math.PI / 2 }
      else { px = -0.351; py = Math.random() * 0.4; pz = (Math.random() - 0.5) * 0.4; ry = -Math.PI / 2 }
      patch.position.set(px, py - 0.15, pz)
      patch.rotation.set(rx, ry, rz + (Math.random() - 0.5) * 0.5)
      bodyGroup.add(patch)
    }

    bodyGroup.position.y = 0.1
    this.artifactGroup.add(bodyGroup)
  }

  _createSiYangFangZun() {
    const bronze = this._createBronzeMaterial(0.35)
    const patina = this._createGreenPatinaMaterial()
    const group = new THREE.Group()

    const bodyGeo = new THREE.BoxGeometry(0.4, 0.5, 0.4)
    const body = new THREE.Mesh(bodyGeo, bronze)
    body.position.y = 0.1
    body.castShadow = true
    group.add(body)

    const neckGeo = new THREE.CylinderGeometry(0.12, 0.18, 0.2, 32)
    const neck = new THREE.Mesh(neckGeo, bronze)
    neck.position.y = 0.45
    neck.castShadow = true
    group.add(neck)

    const mouthGeo = new THREE.CylinderGeometry(0.18, 0.12, 0.06, 32)
    const mouth = new THREE.Mesh(mouthGeo, bronze)
    mouth.position.y = 0.58
    mouth.castShadow = true
    group.add(mouth)

    const baseGeo = new THREE.CylinderGeometry(0.22, 0.2, 0.12, 32)
    const base = new THREE.Mesh(baseGeo, bronze)
    base.position.y = -0.22
    base.castShadow = true
    group.add(base)

    const positions = [
      { x: 0, y: 0.15, z: 0.22, ry: 0 },
      { x: 0, y: 0.15, z: -0.22, ry: Math.PI },
      { x: 0.22, y: 0.15, z: 0, ry: Math.PI / 2 },
      { x: -0.22, y: 0.15, z: 0, ry: -Math.PI / 2 }
    ]

    positions.forEach(p => {
      const headGroup = new THREE.Group()
      const hornGeo = new THREE.ConeGeometry(0.03, 0.12, 8)
      const hornL = new THREE.Mesh(hornGeo, bronze)
      hornL.position.set(-0.06, 0.12, 0)
      hornL.rotation.z = 0.4
      headGroup.add(hornL)
      const hornR = new THREE.Mesh(hornGeo, bronze)
      hornR.position.set(0.06, 0.12, 0)
      hornR.rotation.z = -0.4
      headGroup.add(hornR)
      const headGeo = new THREE.SphereGeometry(0.07, 16, 16)
      const head = new THREE.Mesh(headGeo, bronze)
      head.scale.set(1.2, 0.8, 1)
      headGroup.add(head)
      headGroup.position.set(p.x, p.y, p.z)
      headGroup.rotation.y = p.ry
      headGroup.rotation.x = 0.3
      group.add(headGroup)
    })

    group.position.y = 0.1
    this.artifactGroup.add(group)
  }

  _createJue() {
    const bronze = this._createBronzeMaterial(0.25)
    const group = new THREE.Group()

    const cupGeo = new THREE.CylinderGeometry(0.08, 0.05, 0.18, 32)
    const cup = new THREE.Mesh(cupGeo, bronze)
    cup.position.y = 0.15
    cup.castShadow = true
    group.add(cup)

    const streamGeo = new THREE.CylinderGeometry(0.015, 0.025, 0.2, 12)
    const stream = new THREE.Mesh(streamGeo, bronze)
    stream.position.set(0.12, 0.22, 0)
    stream.rotation.z = -Math.PI / 2.5
    stream.castShadow = true
    group.add(stream)

    const tailGeo = new THREE.CylinderGeometry(0.015, 0.02, 0.15, 12)
    const tail = new THREE.Mesh(tailGeo, bronze)
    tail.position.set(-0.09, 0.22, 0)
    tail.rotation.z = Math.PI / 2.5
    tail.castShadow = true
    group.add(tail)

    for (let i = 0; i < 3; i++) {
      const legGeo = new THREE.CylinderGeometry(0.012, 0.018, 0.22, 12)
      const leg = new THREE.Mesh(legGeo, bronze)
      const angle = (i / 3) * Math.PI * 2
      leg.position.set(Math.cos(angle) * 0.04, 0.04, Math.sin(angle) * 0.04)
      leg.castShadow = true
      group.add(leg)
    }

    const pillarGeo = new THREE.CylinderGeometry(0.01, 0.01, 0.08, 8)
    const pillar = new THREE.Mesh(pillarGeo, bronze)
    pillar.position.set(0, 0.28, 0)
    group.add(pillar)

    group.position.y = 0.05
    this.artifactGroup.add(group)
  }

  _createBell() {
    const bronze = this._createBronzeMaterial(0.35)
    const group = new THREE.Group()

    for (let i = 0; i < 7; i++) {
      const scale = 1 - i * 0.08
      const bellGeo = new THREE.CylinderGeometry(
        0.08 * scale, 0.12 * scale, 0.2 * scale, 24
      )
      const bell = new THREE.Mesh(bellGeo, bronze)
      bell.position.set(i * 0.18 - 0.54, 0.15 + i * 0.02, 0)
      bell.castShadow = true
      group.add(bell)

      const knobGeo = new THREE.SphereGeometry(0.015 * scale, 12, 12)
      const positions = [[-1, -1], [1, -1], [-1, 1], [1, 1]]
      positions.forEach(([dx, dy]) => {
        const knob = new THREE.Mesh(knobGeo, bronze)
        knob.position.set(
          i * 0.18 - 0.54 + dx * 0.08 * scale,
          0.05 + i * 0.02,
          dy * 0.1 * scale
        )
        group.add(knob)
      })
    }

    const beamGeo = new THREE.BoxGeometry(1.5, 0.05, 0.08)
    const beam = new THREE.Mesh(beamGeo, bronze)
    beam.position.y = 0.4
    group.add(beam)

    const postGeo = new THREE.CylinderGeometry(0.03, 0.035, 0.5, 16)
    const postL = new THREE.Mesh(postGeo, bronze)
    postL.position.set(-0.75, 0.15, 0)
    group.add(postL)
    const postR = new THREE.Mesh(postGeo, bronze)
    postR.position.set(0.75, 0.15, 0)
    group.add(postR)

    this.artifactGroup.add(group)
  }

  _createSword() {
    const bronze = this._createBronzeMaterial(0.3)
    const group = new THREE.Group()

    const bladeGeo = new THREE.BoxGeometry(0.04, 0.02, 0.9)
    const blade = new THREE.Mesh(bladeGeo, bronze)
    blade.position.z = 0.25
    blade.castShadow = true
    group.add(blade)

    const tipGeo = new THREE.ConeGeometry(0.025, 0.12, 4)
    const tip = new THREE.Mesh(tipGeo, bronze)
    tip.rotation.x = -Math.PI / 2
    tip.position.z = 0.76
    tip.castShadow = true
    group.add(tip)

    const guardGeo = new THREE.BoxGeometry(0.2, 0.02, 0.04)
    const guard = new THREE.Mesh(guardGeo, bronze)
    guard.position.z = -0.22
    guard.castShadow = true
    group.add(guard)

    const handleGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.2, 16)
    const handle = new THREE.Mesh(handleGeo, bronze)
    handle.rotation.x = Math.PI / 2
    handle.position.z = -0.34
    group.add(handle)

    const pommelGeo = new THREE.SphereGeometry(0.03, 16, 16)
    const pommel = new THREE.Mesh(pommelGeo, bronze)
    pommel.position.z = -0.45
    group.add(pommel)

    group.rotation.y = Math.PI / 2
    group.position.y = 0.1
    this.artifactGroup.add(group)
  }

  clearArtifact() {
    if (!this.artifactGroup) return
    while (this.artifactGroup.children.length > 0) {
      const child = this.artifactGroup.children[0]
      this.artifactGroup.remove(child)
      if (child.geometry) child.geometry.dispose()
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach(m => m.dispose())
        else child.material.dispose()
      }
    }
    this.clearRiskZones()
    this.clearParticles()
  }

  addRiskZone(options = {}) {
    const {
      center = { x: 0, y: 0, z: 0 },
      radius = 0.05,
      severity = 0.5,
      zoneId = `Z${this.riskZones.length + 1}`,
      showLabel = true
    } = options

    const zoneGroup = new THREE.Group()

    const pulseGeo = new THREE.SphereGeometry(radius * 0.8, 32, 32)
    const intensity = Math.min(1, 0.3 + severity * 0.7)
    const pulseMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(1.0, 0.2 * (1 - severity), 0.2 * (1 - severity)),
      transparent: true,
      opacity: 0.35 * intensity,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
    const pulseSphere = new THREE.Mesh(pulseGeo, pulseMat)
    pulseSphere.userData.baseScale = 1.0
    pulseSphere.userData.mat = pulseMat
    zoneGroup.add(pulseSphere)

    const ringGeo = new THREE.RingGeometry(radius * 0.3, radius, 64)
    const ringMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(1.0, 0.25 + 0.2 * (1 - severity), 0.1),
      transparent: true,
      opacity: 0.7 * intensity,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
    const ring = new THREE.Mesh(ringGeo, ringMat)
    ring.lookAt(this.camera.position)
    ring.userData.mat = ringMat
    ring.userData.rotSpeed = 0.5 + Math.random() * 0.5
    zoneGroup.add(ring)

    const haloGeo = new THREE.SphereGeometry(radius * 1.5, 32, 32)
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0xff3333,
      transparent: true,
      opacity: 0.08 * intensity,
      side: THREE.BackSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
    const halo = new THREE.Mesh(haloGeo, haloMat)
    halo.userData.mat = haloMat
    zoneGroup.add(halo)

    for (let ri = 0; ri < 3; ri++) {
      const shockGeo = new THREE.RingGeometry(radius * (0.4 + ri * 0.3), radius * (0.5 + ri * 0.3), 64)
      const shockMat = new THREE.MeshBasicMaterial({
        color: 0xff5555,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
      const shock = new THREE.Mesh(shockGeo, shockMat)
      shock.lookAt(this.camera.position)
      shock.userData = {
        ...shock.userData,
        mat: shockMat,
        delay: ri * 0.5,
        isShock: true
      }
      zoneGroup.add(shock)
    }

    zoneGroup.position.set(center.x, center.y, center.z)
    zoneGroup.userData = {
      zoneId,
      severity,
      isRiskZone: true,
      basePosition: { ...center }
    }

    this.artifactGroup.add(zoneGroup)
    this.riskZones.push(zoneGroup)
    this.riskMaterials.push(pulseMat, ringMat, haloMat)

    return zoneGroup
  }

  addEruptionParticles(options = {}) {
    const {
      center = { x: 0, y: 0, z: 0 },
      radius = 0.04,
      severity = 0.8,
      zoneId = `E${this.eruptionParticles.length + 1}`
    } = options

    const eruptionGroup = new THREE.Group()

    const particleCount = Math.floor(200 + severity * 400)
    const positions = new Float32Array(particleCount * 3)
    const colors = new Float32Array(particleCount * 3)
    const velocities = []
    const lifetimes = new Float32Array(particleCount)

    const colorPalette = [
      new THREE.Color(1.0, 0.15, 0.1),
      new THREE.Color(1.0, 0.5, 0.1),
      new THREE.Color(1.0, 0.85, 0.1),
      new THREE.Color(0.8, 0.7, 0.2),
      new THREE.Color(0.3, 0.6, 0.2)
    ]

    for (let i = 0; i < particleCount; i++) {
      const theta = Math.random() * Math.PI * 2
      const phi = Math.random() * Math.PI * 0.6
      const r = radius * (0.2 + Math.random() * 0.8)

      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      positions[i * 3 + 1] = r * Math.cos(phi)
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta)

      const colorIdx = severity > 0.7
        ? Math.floor(Math.random() * 3)
        : Math.floor(Math.random() * colorPalette.length)
      const c = colorPalette[colorIdx].clone()
      c.offsetHSL(0, 0, (Math.random() - 0.5) * 0.2)
      colors[i * 3] = c.r
      colors[i * 3 + 1] = c.g
      colors[i * 3 + 2] = c.b

      velocities.push({
        x: (Math.random() - 0.5) * 0.03,
        y: 0.01 + Math.random() * 0.05 * severity,
        z: (Math.random() - 0.5) * 0.03
      })

      lifetimes[i] = Math.random()
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geo.setAttribute('lifetime', new THREE.BufferAttribute(lifetimes, 1))

    const canvas = document.createElement('canvas')
    canvas.width = 64
    canvas.height = 64
    const ctx = canvas.getContext('2d')
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
    gradient.addColorStop(0, 'rgba(255,255,255,1)')
    gradient.addColorStop(0.2, 'rgba(255,220,150,0.9)')
    gradient.addColorStop(0.5, 'rgba(255,120,60,0.5)')
    gradient.addColorStop(1, 'rgba(255,50,30,0)')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, 64, 64)
    const tex = new THREE.CanvasTexture(canvas)

    const mat = new THREE.PointsMaterial({
      size: 0.018 + severity * 0.012,
      vertexColors: true,
      map: tex,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true
    })

    const points = new THREE.Points(geo, mat)
    points.userData = {
      velocities,
      isParticleSystem: true,
      basePositions: positions.slice(),
      lifetimes: geo.attributes.lifetime.array,
      mat
    }
    eruptionGroup.add(points)

    const coreGeo = new THREE.SphereGeometry(radius * 0.5, 24, 24)
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xff4400,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
    const core = new THREE.Mesh(coreGeo, coreMat)
    core.userData.mat = coreMat
    eruptionGroup.add(core)

    const beamGeo = new THREE.CylinderGeometry(radius * 0.1, radius * 0.6, 0.5, 24, 1, true)
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xff6622,
      transparent: true,
      opacity: 0.25,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
    const beam = new THREE.Mesh(beamGeo, beamMat)
    beam.position.y = 0.25
    beam.userData.mat = beamMat
    eruptionGroup.add(beam)

    const smokeGeo = new THREE.SphereGeometry(radius * 2.5, 16, 16)
    const smokeMat = new THREE.MeshBasicMaterial({
      color: 0x447744,
      transparent: true,
      opacity: 0.06,
      side: THREE.BackSide,
      depthWrite: false
    })
    const smoke = new THREE.Mesh(smokeGeo, smokeMat)
    smoke.position.y = radius * 0.5
    smoke.userData.mat = smokeMat
    eruptionGroup.add(smoke)

    eruptionGroup.position.set(center.x, center.y, center.z)
    eruptionGroup.userData = {
      zoneId,
      severity,
      isEruption: true,
      basePosition: { ...center }
    }

    this.artifactGroup.add(eruptionGroup)
    this.eruptionParticles.push(eruptionGroup)
    this.particleSystems.push(points)

    return eruptionGroup
  }

  clearRiskZones() {
    this.riskZones.forEach(z => {
      this.artifactGroup.remove(z)
      z.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose()
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose())
          else obj.material.dispose()
        }
      })
    })
    this.riskZones = []
    this.riskMaterials = []
  }

  clearParticles() {
    this.eruptionParticles.forEach(z => {
      this.artifactGroup.remove(z)
      z.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose()
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose())
          else obj.material.dispose()
        }
      })
    })
    this.eruptionParticles = []
    this.particleSystems = []
  }

  updateRiskZonesFromData(zones = []) {
    this.clearRiskZones()
    zones
      .filter(z => z.type === 'risk')
      .forEach(z => this.addRiskZone({
        center: z.center,
        radius: z.radius,
        severity: z.severity,
        zoneId: z.zone_id
      }))
  }

  updateEruptionsFromData(eruptions = []) {
    this.clearParticles()
    eruptions.forEach(z => this.addEruptionParticles({
      center: z.center,
      radius: z.radius,
      severity: z.severity,
      zoneId: z.patch_id || z.zone_id
    }))
  }

  _animate = () => {
    this.animationId = requestAnimationFrame(this._animate)
    const delta = this.clock.getDelta()
    const elapsed = this.clock.getElapsedTime()

    this.controls.update()
    TWEEN.update()

    this.riskZones.forEach((zone, idx) => {
      const phase = elapsed * 2 + idx * 0.7
      zone.children.forEach(child => {
        if (child.userData?.mat && !child.userData?.isShock) {
          const s = 1 + 0.25 * Math.sin(phase)
          child.scale.setScalar(s)
          child.userData.mat.opacity = (child.userData.mat.opacity ?? 0.5) * 0.98 +
            (0.35 + 0.25 * (Math.sin(phase) * 0.5 + 0.5)) * 0.02
          if (child.lookAt && child.material?.transparent) {
            child.lookAt(this.camera.position)
            child.rotation.z += child.userData.rotSpeed ? child.userData.rotSpeed * delta : 0
          }
        }
        if (child.userData?.isShock) {
          const t = (elapsed + child.userData.delay) % 2.0 / 2.0
          child.scale.setScalar(1 + t * 3)
          child.userData.mat.opacity = (1 - t) * 0.5
          child.lookAt(this.camera.position)
        }
      })
    })

    this.particleSystems.forEach(system => {
      const pos = system.geometry.attributes.position.array
      const life = system.userData.lifetimes
      const base = system.userData.basePositions
      const vel = system.userData.velocities
      const cycle = (elapsed * 0.3) % 1.0

      for (let i = 0; i < pos.length / 3; i++) {
        let t = (cycle + life[i]) % 1.0
        const ease = t * t * (3 - 2 * t)
        pos[i * 3] = base[i * 3] + vel[i].x * ease * 300
        pos[i * 3 + 1] = base[i * 3 + 1] + vel[i].y * ease * 200 + Math.sin(elapsed * 3 + i) * 0.005
        pos[i * 3 + 2] = base[i * 3 + 2] + vel[i].z * ease * 300
      }
      system.geometry.attributes.position.needsUpdate = true
      system.userData.mat.opacity = 0.6 + 0.3 * Math.sin(elapsed * 4)
      system.rotation.y += delta * 0.1
    })

    this.eruptionParticles.forEach(group => {
      group.children.forEach(child => {
        if (child.userData?.mat && !child.isPoints) {
          const m = child.userData.mat
          if (m.opacity !== undefined) {
            m.opacity = Math.max(0.1, m.opacity + Math.sin(elapsed * 5) * 0.02)
          }
        }
      })
    })

    this.renderer.render(this.scene, this.camera)
  }

  _onResize() {
    const w = this.container.clientWidth
    const h = this.container.clientHeight
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h)
  }

  setAutoRotate(enabled) {
    this.controls.autoRotate = enabled
  }

  resetCamera() {
    new TWEEN.Tween(this.camera.position)
      .to({ x: 1.5, y: 1.2, z: 2.0 }, 800)
      .easing(TWEEN.Easing.Cubic.InOut)
      .start()
    new TWEEN.Tween(this.controls.target)
      .to({ x: 0, y: 0.2, z: 0 }, 800)
      .easing(TWEEN.Easing.Cubic.InOut)
      .start()
  }

  showStats() {
    return {
      riskZones: this.riskZones.length,
      eruptions: this.eruptionParticles.length,
      particles: this.particleSystems.reduce((s, p) => s + p.geometry.attributes.position.count, 0)
    }
  }

  dispose() {
    if (this.animationId) cancelAnimationFrame(this.animationId)
    this.clearArtifact()
    window.removeEventListener('resize', () => this._onResize())
    this.controls?.dispose()
    this.renderer?.dispose()
    if (this.renderer?.domElement?.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement)
    }
  }
}

export default BronzeArtifactViewer
