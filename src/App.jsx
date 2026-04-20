
import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Html } from "@react-three/drei";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
const ORGANELLES = {
  chromatin: {
    label: "Хроматин",
    objects: ["Object_63"]
  },
  nucleus: {
    label: "Ядро",
    objects: ["Object_64"]
  },
  nuclear_membrane: {
    label: "Ядерная оболочка",
    objects: ["Object_62"]
  },
  er: {
    label: "Эндоплазматический ретикулум (ЭПР)",
    objects: ["Object_177", "Object_141", "Object_118", "Object_5", "Object_117", "Object_69", "Object_70", "Object_67", "Object_68"]
  },
  golgi: {
    label: "Аппарат Гольджи",
    objects: ["Object_128", "Object_122", "Object_123", "Object_124"]
  },
  mitochondria_outer: {
    label: "Митохондрия (оболочка)",
    objects: ["Object_209", "Object_2"]
  },
  mitochondria_inner: {
    label: "Митохондрия (кристы)",
    objects: ["Object_3", "Object_208"]
  },
  centrioles: {
    label: "Центриоли",
    objects: ["Object_207", "Object_205"]
  },
  lysosome: {
    label: "Лизосома",
    objects: ["Object_203", "Object_6"]
  },
  smooth_er: {
    label: "Гладкая ЭПС",
    objects: ["Object_11", "Object_10", "Object_9", "Object_8", "Object_7"]
  },
  vacuole: {
    label: "Вакуоль",
    objects: ["Object_125", "Object_126", "Object_127"]
  },
  ribosome: {
    label: "Рибосомы",
    objects: [],
  }
};

const ORGANELLE_DESCRIPTIONS = {
  chromatin: "Комплекс ДНК и белков в ядре. Обеспечивает хранение и реализацию генетической информации.",
  nucleus: "Органоид, содержащий ДНК. Контролирует основные процессы клетки.",
  nuclear_membrane: "Двойная мембрана, отделяющая ядро от цитоплазмы. Имеет поры для транспорта веществ.",
  er: "Мембранная система каналов. Участвует в синтезе и транспорте веществ.",
  golgi: "Модифицирует, сортирует и упаковывает белки и липиды. Обеспечивает их транспорт.",
  mitochondria_outer: "Двумембранная структура митохондрии. Обеспечивает изоляцию и обмен веществ.",
  mitochondria_inner: "Складки внутренней мембраны. Увеличивают площадь для синтеза АТФ.",
  centrioles: "Структуры из микротрубочек. Участвуют в делении клетки.",
  lysosome: "Органоид с ферментами. Осуществляет внутриклеточное переваривание.",
  smooth_er: "Синтезирует липиды и участвует в детоксикации. Не содержит рибосом.",
  vacuole: "Полость с клеточным соком. Запасает вещества и поддерживает давление.",
  ribosome: "Молекулярные комплексы, отвечающие за синтез белка."
};
function findOrganelle(mesh) {
  if (!mesh) return null;

  for (const key in ORGANELLES) {
    const organelle = ORGANELLES[key];
    if (organelle.objects.includes(mesh.name)) {
      return { key, ...organelle };
    }
  }

  return null;
}

function resolveSelectableObject(object) {
  let obj = object;

  while (obj) {
    // Игнорируем внешнюю и внутреннюю стенки при выборе объекта.
    if (obj.name === "Object_4" || obj.name === "Object_116") {
      obj = obj.parent;
      continue;
    }

    const organelle = findOrganelle(obj);
    if (organelle) {
      return obj;
    }

    obj = obj.parent;
  }

  return null;
}

function getUsedObjectNames() {
  const used = new Set();

  for (const [key, organelle] of Object.entries(ORGANELLES)) {
    if (key === "ribosome") continue;
    for (const name of organelle.objects) {
      used.add(name);
    }
  }

  used.add("Object_4");
  used.add("Object_116");

  return used;
}

function getOrganellePrimaryMesh(root, organelleKey) {
  if (!root || !organelleKey || !ORGANELLES[organelleKey]) return null;

  for (const objectName of ORGANELLES[organelleKey].objects) {
    const mesh = root.getObjectByName(objectName);
    if (mesh) return mesh;
  }

  return null;
}

function fitCameraToObject(camera, controls, object, offset = 1.8) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  const maxSize = Math.max(size.x, size.y, size.z);
  const fitHeightDistance = maxSize / (2 * Math.atan((Math.PI * camera.fov) / 360));
  const fitWidthDistance = fitHeightDistance / camera.aspect;
  const distance = offset * Math.max(fitHeightDistance, fitWidthDistance);

  const direction = new THREE.Vector3(1, 0.35, 1).normalize();
  const position = center.clone().add(direction.multiplyScalar(distance));

  camera.position.copy(position);
  camera.near = Math.max(distance / 100, 0.01);
  camera.far = Math.max(distance * 100, 1000);
  camera.updateProjectionMatrix();

  if (controls) {
    controls.target.copy(center);
    controls.update();
  }

  return { center, distance };
}

function getCameraFitState(camera, object, offset = 1.8) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxSize = Math.max(size.x, size.y, size.z);
  const fitHeightDistance = maxSize / (2 * Math.atan((Math.PI * camera.fov) / 360));
  const fitWidthDistance = fitHeightDistance / camera.aspect;
  const distance = offset * Math.max(fitHeightDistance, fitWidthDistance);
  const direction = new THREE.Vector3(1, 0.35, 1).normalize();
  const position = center.clone().add(direction.multiplyScalar(distance));

  return { center, position, distance };
}

function CameraRig({
  targetMesh,
  selectedOrganelle,
  overviewMesh,
  cinematicTrigger,
  overviewTrigger,
  controlsRef,
  autoRotate
}) {
  const { camera } = useThree();
  const animRef = useRef(null);

  useEffect(() => {
    if (!targetMesh || !cinematicTrigger) return;

    const controls = controlsRef.current;
    const box = new THREE.Box3().setFromObject(targetMesh);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const radius = Math.max(size.x, size.y, size.z) * 0.75 || 0.5;

    const startPos = camera.position.clone();
    const startTarget = controls ? controls.target.clone() : new THREE.Vector3();

    const dir = camera.position.clone().sub(startTarget).normalize();
    const isRibosome = selectedOrganelle?.key === "ribosome";
    const midDistance = Math.max(radius * (isRibosome ? 11 : 7.2), isRibosome ? 3.4 : 1.5);
    const endDistance = Math.max(radius * (isRibosome ? 7.4 : 4.5), isRibosome ? 2.25 : 0.95);
    const midPos = center.clone().add(dir.clone().multiplyScalar(midDistance));
    const endPos = center.clone().add(dir.clone().multiplyScalar(endDistance));
    const endTarget = center.clone();

    animRef.current = {
      t: 0,
      duration: 1.2,
      startPos,
      startTarget,
      midPos,
      endPos,
      endTarget,
    };
  }, [cinematicTrigger, targetMesh, selectedOrganelle, camera, controlsRef]);

  useEffect(() => {
    if (!overviewMesh || !overviewTrigger) return;

    const controls = controlsRef.current;
    const fit = getCameraFitState(camera, overviewMesh, 1.9);
    const startPos = camera.position.clone();
    const startTarget = controls ? controls.target.clone() : new THREE.Vector3();
    const midPos = startPos
      .clone()
      .lerp(fit.position, 0.45)
      .add(new THREE.Vector3(0, fit.distance * 0.08, 0));

    animRef.current = {
      t: 0,
      duration: 1.05,
      startPos,
      startTarget,
      midPos,
      endPos: fit.position.clone(),
      endTarget: fit.center.clone(),
    };
  }, [overviewTrigger, overviewMesh, camera, controlsRef]);

  useFrame((_, delta) => {
    const controls = controlsRef.current;

    if (animRef.current) {
      const a = animRef.current;
      a.t = Math.min(a.t + delta / a.duration, 1);
      const eased = 1 - Math.pow(1 - a.t, 3);

      const curve = new THREE.QuadraticBezierCurve3(a.startPos, a.midPos, a.endPos);
      const pos = curve.getPoint(eased);
      camera.position.copy(pos);

      const target = a.startTarget.clone().lerp(a.endTarget, eased);
      if (controls) {
        controls.target.copy(target);
        controls.update();
      }

      if (a.t >= 1) animRef.current = null;
      return;
    }

    if (controls) {
      controls.autoRotate = autoRotate;
      controls.update();
    }
  });

  return null;
}

function applyHighlight(root, hovered, selected, time = 0) {
  if (!root) return;

  const selectedGroup = selected ? findOrganelle(selected) : null;
  const hoveredGroup = hovered ? findOrganelle(hovered) : null;

  root.traverse((child) => {
    if (!child.isMesh || !child.material) return;

    if (!child.userData.__baseMaterial) {
      child.userData.__baseMaterial = child.material;
    }

    child.material = child.userData.__baseMaterial;
  });

  const glowGroup = (group, color, intensity) => {
    if (!group) return;

    root.traverse((child) => {
      if (!child.isMesh) return;
      if (!group.objects.includes(child.name)) return;

      const base = child.userData.__baseMaterial;
      const mat = base.clone();

      if ("emissive" in mat) {
        mat.emissive = new THREE.Color(color);
        mat.emissiveIntensity = intensity;
      }

      child.material = mat;
    });
  };

  if (hoveredGroup && hoveredGroup !== selectedGroup) {
    glowGroup(hoveredGroup, "#66ccff", 0.10);
  }

  if (selectedGroup) {
    const pulse = 0.12 + Math.sin(time * 2.4) * 0.04;
    glowGroup(selectedGroup, "#ffd166", pulse);
  }
}

function GLBModel({ file, onLoaded, onHover, onSelect, hovered, selected }) {
  const [root, setRoot] = useState(null);

  useEffect(() => {
    if (!file) {
      setRoot(null);
      return;
    }

    const loader = new GLTFLoader();
    let mounted = true;

    const ER_OBJECTS = [
      "Object_177",
      "Object_141",
      "Object_118",
      "Object_5",
      "Object_117",
      "Object_69",
      "Object_70",
      "Object_67",
      "Object_68",
    ];

    loader.load(
      file,
      (gltf) => {
        if (!mounted) return;
        const scene = gltf.scene;

        scene.traverse((obj) => {
          if (!obj.isMesh) return;

          obj.castShadow = true;
          obj.receiveShadow = true;
          obj.frustumCulled = false;

          if (!obj.material) return;

          const materials = Array.isArray(obj.material)
            ? obj.material
            : [obj.material];

          materials.forEach((mat) => {
            // Базовые параметры материала сохраняем до применения подсветки.
            mat.side = THREE.DoubleSide;
            mat.needsUpdate = true;
          });

          // Отдельно фиксируем материалы для ЭПС.
          if (ER_OBJECTS.includes(obj.name)) {
            obj.renderOrder = 10;

            materials.forEach((mat) => {
              mat.side = THREE.DoubleSide;
              mat.transparent = false;
              mat.opacity = 1;
              mat.depthWrite = true;
              mat.depthTest = true;
              mat.alphaTest = 0;
              mat.needsUpdate = true;
            });
          }

          // Оболочки клетки оставляем полупрозрачными.
          if (obj.name === "Object_4" || obj.name === "Object_116") {
            obj.renderOrder = 1;

            materials.forEach((mat) => {
              mat.transparent = true;
              mat.opacity = 0.35;
              mat.depthWrite = false;
              mat.needsUpdate = true;
            });
          }
        });

        setRoot(scene);
        onLoaded(scene);
      },
      undefined,
      (err) => {
        console.error("GLB load error:", err);
      }
    );

    return () => {
      mounted = false;
    };
  }, [file, onLoaded]);

  useFrame(({ clock }) => {
    if (!root) return;
    applyHighlight(root, hovered, selected, clock.getElapsedTime());
  });

  if (!root) {
    return (
      <Html center>
        <div className="loading-pill">Загрузка модели...</div>
      </Html>
    );
  }

  return (
    <primitive
      object={root}
      onPointerMissed={() => onSelect(null)}
      onPointerOver={(e) => {
        e.stopPropagation();
        const resolved = resolveSelectableObject(e.object);
        onHover(resolved);
      }}
      onPointerOut={(e) => {
        e.stopPropagation();
        onHover(null);
      }}
      onClick={(e) => {
        e.stopPropagation();
        const resolved = resolveSelectableObject(e.object);
        if (resolved) {
          onSelect(resolved);
        } else {
          onSelect(null);
        }
      }}
    />
  );
}

function Scene({
  file,
  sceneRoot,
  selectedOrganelle,
  onSceneReady,
  hovered,
  setHovered,
  selected,
  setSelected,
  cinematicTrigger,
  overviewTrigger,
  autoRotate,
  controlsRef,
}) {

  return (
    <Canvas
      gl={{ antialias: true, alpha: true }}
      dpr={[1, 2]}
      shadows
      camera={{ position: [4, 2.4, 4], fov: 45 }}
      >
      <ambientLight intensity={0.9} />
      <hemisphereLight intensity={0.75} color="#8e7884" groundColor="#241a20" />
      <directionalLight
        position={[6, 8, 6]}
        intensity={1.9}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <directionalLight position={[-7, 4, -5]} intensity={1.1} color="#7c6a75" />
      <pointLight position={[-5, 3, -4]} intensity={1.05} color="#8f7b99" />
      <pointLight position={[4, -2, 5]} intensity={0.8} color="#6d4d5f" />
      <pointLight position={[0, 5, -7]} intensity={0.9} color="#c8b5c2" />
      <pointLight position={[-4, -1, 4]} intensity={0.7} color="#8a6f7c" />

      <Suspense
        fallback={
          <Html center>
            <div className="loading-pill">Инициализация сцены...</div>
          </Html>
        }
      >
        <GLBModel
          file={file}
          onLoaded={onSceneReady}
          onHover={setHovered}
          onSelect={setSelected}
          hovered={hovered}
          selected={selected}
        />
        <SelectedLabel3D selected={selected} selectedOrganelle={selectedOrganelle} />
      </Suspense>
      <CameraRig
        targetMesh={selected}
        selectedOrganelle={selectedOrganelle}
        overviewMesh={sceneRoot}
        cinematicTrigger={cinematicTrigger}
        overviewTrigger={overviewTrigger}
        controlsRef={controlsRef}
        autoRotate={autoRotate}
      />
      <OrbitControls
        ref={controlsRef}
        enableDamping
        dampingFactor={0.08}
        autoRotateSpeed={0.67}
        enablePan={true}
        panSpeed={0.8}
        minDistance={0.5}
        maxDistance={200}
        maxPolarAngle={Math.PI * 0.95}
        mouseButtons={{
          LEFT: THREE.MOUSE.ROTATE,
          MIDDLE: THREE.MOUSE.DOLLY,
          RIGHT: THREE.MOUSE.PAN,
        }}
      />
    </Canvas>
  );
}

function SelectedOutline({ root, selectedOrganelle }) {
  const outlines = useMemo(() => {
    if (!root || !selectedOrganelle) return [];

    root.updateMatrixWorld(true);

    const result = [];

    root.traverse((child) => {
      if (!child.isMesh) return;
      if (!selectedOrganelle.objects.includes(child.name)) return;

      const edges = new THREE.EdgesGeometry(child.geometry, 25);

      const position = new THREE.Vector3();
      const quaternion = new THREE.Quaternion();
      const scale = new THREE.Vector3();

      child.matrixWorld.decompose(position, quaternion, scale);

      result.push({
        key: child.uuid,
        geometry: edges,
        position: position.clone(),
        quaternion: quaternion.clone(),
        scale: scale.clone(),
      });
    });

    return result;
  }, [root, selectedOrganelle]);

  useEffect(() => {
    return () => {
      outlines.forEach((o) => o.geometry.dispose());
    };
  }, [outlines]);

  if (!selectedOrganelle) return null;

  return (
    <group>
      {outlines.map((o) => (
        <lineSegments
          key={o.key}
          geometry={o.geometry}
          position={o.position}
          quaternion={o.quaternion}
          scale={o.scale}
          renderOrder={999}
        >
          <lineBasicMaterial
            color="#ffb703"
            transparent
            opacity={1}
            depthTest={false}
          />
        </lineSegments>
      ))}
    </group>
  );
}

function SelectedLabel3D({ selected, selectedOrganelle }) {
  const labelData = useMemo(() => {
    if (!selected || !selectedOrganelle) return null;

    const box = new THREE.Box3().setFromObject(selected);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());

    return {
      position: [center.x, center.y + Math.max(size.y * 0.9, 0.35), center.z],
      title: selectedOrganelle.label,
      text:
        ORGANELLE_DESCRIPTIONS[selectedOrganelle.key] ||
        "Описание пока не добавлено.",
    };
  }, [selected, selectedOrganelle]);

  if (!labelData) return null;

  return (
    <Html position={labelData.position} center transform={false} zIndexRange={[100, 0]}>
      <div
        style={{
          width: 320,
          padding: "12px 14px",
          borderRadius: 16,
          background: "rgba(255,255,255,0.92)",
          color: "#0f172a",
          boxShadow: "0 12px 30px rgba(15,23,42,0.12)",
          border: "1px solid rgba(15,23,42,0.08)",
          backdropFilter: "blur(10px)",
          pointerEvents: "none",
        }}
      >
        <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 6 }}>
          {labelData.title}
        </div>
        <div style={{ fontSize: 14, lineHeight: 1.55, color: "#334155" }}>
          {labelData.text}
        </div>
      </div>
    </Html>
  );
}

function CellBackgroundBlobs() {
  const groupRef = useRef();
  const blobConfigs = useMemo(
    () => [
      { position: [-6.3, 2.4, -1.8], scale: [1.5, 1.1, 1.2], color: "#5d4951", opacity: 0.18 },
      { position: [6.1, -1.3, -1.4], scale: [1.8, 1.3, 1.4], color: "#4d3c45", opacity: 0.16 },
      { position: [0.4, 5.9, -2.6], scale: [1.2, 1.5, 1.1], color: "#6b5761", opacity: 0.12 },
      { position: [-1.4, -5.8, -1.9], scale: [1.6, 1.1, 1.6], color: "#46353d", opacity: 0.12 },
      { position: [4.6, 3.3, 0.9], scale: [1.9, 1.4, 1.2], color: "#7b6870", opacity: 0.1 },
    ],
    []
  );

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const t = clock.getElapsedTime();
    groupRef.current.rotation.z = Math.sin(t * 0.08) * 0.03;
    groupRef.current.rotation.y = Math.cos(t * 0.06) * 0.03;
    groupRef.current.position.y = Math.sin(t * 0.12) * 0.12;
  });

  return (
    <group ref={groupRef}>
      {blobConfigs.map((blob, index) => (
        <mesh key={index} position={blob.position} scale={blob.scale}>
          <sphereGeometry args={[1.7, 48, 48]} />
          <meshBasicMaterial
            color={blob.color}
            transparent
            opacity={blob.opacity}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}

function CellParticles() {
  const pointsRef = useRef();

  const { positions, sizes } = useMemo(() => {
    const count = 280;
    const positions = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const direction = new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 1.3
      ).normalize();
      const radius = 5 + Math.random() * 1.5;

      positions[i * 3 + 0] = direction.x * radius;
      positions[i * 3 + 1] = direction.y * radius;
      positions[i * 3 + 2] = direction.z * radius * 0.85;
    }

    return { positions };
  }, []);

  useFrame(({ clock }) => {
    if (!pointsRef.current) return;
    pointsRef.current.rotation.y = clock.getElapsedTime() * 0.03;
    pointsRef.current.rotation.x = Math.sin(clock.getElapsedTime() * 0.2) * 0.03;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={positions.length / 3}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        color="#b698aa"
        size={0.085}
        sizeAttenuation
        transparent
        opacity={0.34}
        depthWrite={false}
      />
    </points>
  );
}

function CellAmbientMembranes() {
  const groupRef = useRef();
  const membranes = useMemo(
    () => [
      {
        position: [-6.8, 1.2, -1.9],
        rotation: [0.25, -0.4, 0.15],
        scale: [2.4, 3.4, 1],
        color: "#654952",
        opacity: 0.1,
      },
      {
        position: [6.6, -0.8, -1.6],
        rotation: [-0.3, 0.45, -0.18],
        scale: [2.8, 3.8, 1],
        color: "#564048",
        opacity: 0.09,
      },
      {
        position: [0.8, -6.1, -2.4],
        rotation: [1.2, 0.1, 0.3],
        scale: [4.2, 2.1, 1],
        color: "#433138",
        opacity: 0.08,
      },
    ],
    []
  );

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const t = clock.getElapsedTime();
    groupRef.current.children.forEach((child, index) => {
      child.position.y += Math.sin(t * 0.22 + index) * 0.0018;
      child.rotation.z += Math.cos(t * 0.18 + index) * 0.0008;
    });
  });

  return (
    <group ref={groupRef}>
      {membranes.map((membrane, index) => (
        <mesh
          key={index}
          position={membrane.position}
          rotation={membrane.rotation}
          scale={membrane.scale}
        >
          <circleGeometry args={[1, 64]} />
          <meshBasicMaterial
            color={membrane.color}
            transparent
            opacity={membrane.opacity}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
}

function CellFloatingSpecks() {
  const groupRef = useRef();
  const specks = useMemo(
    () =>
      Array.from({ length: 18 }, (_, index) => ({
        key: index,
        basePosition: new THREE.Vector3().randomDirection().multiplyScalar(5.2 + Math.random() * 1.4),
        radius: Math.random() * 0.12 + 0.06,
        color: ["#b38da0", "#9f7f92", "#c1a6b4"][index % 3],
        speed: Math.random() * 0.3 + 0.15,
        drift: Math.random() * 0.6 + 0.25,
      })),
    []
  );

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const t = clock.getElapsedTime();

    groupRef.current.children.forEach((child, index) => {
      const speck = specks[index];
      child.position.x = speck.basePosition.x + Math.sin(t * speck.speed + index) * speck.drift;
      child.position.y = speck.basePosition.y + Math.cos(t * (speck.speed + 0.08) + index) * speck.drift * 0.55;
      child.position.z = speck.basePosition.z * 0.65 + Math.sin(t * 0.18 + index) * 0.22;
    });
  });

  return (
    <group ref={groupRef}>
      {specks.map((speck) => (
        <mesh key={speck.key} position={speck.basePosition}>
          <sphereGeometry args={[speck.radius, 18, 18]} />
          <meshBasicMaterial
            color={speck.color}
            transparent
            opacity={0.22}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}

function ScreenSpaceAtmosphere() {
  const specks = useMemo(
    () => [
      { left: "5%", top: "84%", size: 6, delay: "0s", duration: "13s" },
      { left: "13%", top: "43%", size: 4, delay: "1.2s", duration: "15s" },
      { left: "18%", top: "12%", size: 5, delay: "0.4s", duration: "12s" },
      { left: "24%", top: "27%", size: 4, delay: "2.2s", duration: "16s" },
      { left: "29%", top: "66%", size: 5, delay: "1.6s", duration: "14s" },
      { left: "35%", top: "32%", size: 4, delay: "0.8s", duration: "12s" },
      { left: "42%", top: "18%", size: 5, delay: "1.1s", duration: "17s" },
      { left: "47%", top: "62%", size: 4, delay: "2.8s", duration: "15s" },
      { left: "53%", top: "41%", size: 4, delay: "0.3s", duration: "14s" },
      { left: "61%", top: "76%", size: 5, delay: "1.7s", duration: "16s" },
      { left: "69%", top: "23%", size: 4, delay: "2s", duration: "13s" },
      { left: "76%", top: "58%", size: 5, delay: "0.6s", duration: "15s" },
      { left: "83%", top: "31%", size: 4, delay: "1.9s", duration: "14s" },
      { left: "91%", top: "79%", size: 5, delay: "1.4s", duration: "17s" },
    ],
    []
  );

  const orbs = useMemo(
    () => [
      { left: "14%", top: "52%", size: 38, opacity: 0.18, delay: "0.2s" },
      { left: "32%", top: "8%", size: 24, opacity: 0.16, delay: "1.1s" },
      { left: "55%", top: "79%", size: 28, opacity: 0.14, delay: "2s" },
      { left: "78%", top: "48%", size: 22, opacity: 0.18, delay: "0.7s" },
      { left: "89%", top: "15%", size: 32, opacity: 0.16, delay: "1.6s" },
    ],
    []
  );

  const creatures = useMemo(
    () => [
      { left: "8%", top: "18%", width: 86, height: 30, delay: "0s", duration: "20s" },
      { left: "71%", top: "24%", width: 64, height: 24, delay: "1.8s", duration: "16s" },
      { left: "76%", top: "62%", width: 92, height: 34, delay: "0.9s", duration: "18s" },
      { left: "18%", top: "72%", width: 72, height: 28, delay: "2.4s", duration: "19s" },
    ],
    []
  );

  const microbes = useMemo(
    () => [
      { left: "8%", top: "24%", size: 56, rotate: "-14deg", delay: "0.3s", duration: "24s" },
      { left: "18%", top: "78%", size: 44, rotate: "11deg", delay: "2s", duration: "20s" },
      { left: "74%", top: "14%", size: 52, rotate: "8deg", delay: "1.1s", duration: "22s" },
      { left: "86%", top: "74%", size: 40, rotate: "-10deg", delay: "2.8s", duration: "19s" },
    ],
    []
  );

  return (
    <div className="screen-atmosphere" aria-hidden="true">
      <div className="screen-atmosphere__veil" />
      {microbes.map((microbe, index) => (
        <span
          key={`microbe-${index}`}
          className="screen-atmosphere__microbe"
          style={{
            left: microbe.left,
            top: microbe.top,
            fontSize: microbe.size,
            transform: `rotate(${microbe.rotate})`,
            animationDelay: microbe.delay,
            animationDuration: microbe.duration,
          }}
        >
          🦠
        </span>
      ))}
      {creatures.map((creature, index) => (
        <span
          key={`creature-${index}`}
          className="screen-atmosphere__creature"
          style={{
            left: creature.left,
            top: creature.top,
            width: creature.width,
            height: creature.height,
            animationDelay: creature.delay,
            animationDuration: creature.duration,
          }}
        />
      ))}
      {specks.map((speck, index) => (
        <span
          key={`speck-${index}`}
          className="screen-atmosphere__speck"
          style={{
            left: speck.left,
            top: speck.top,
            width: speck.size,
            height: speck.size,
            animationDelay: speck.delay,
            animationDuration: speck.duration,
          }}
        />
      ))}
      {orbs.map((orb, index) => (
        <span
          key={`orb-${index}`}
          className="screen-atmosphere__orb"
          style={{
            left: orb.left,
            top: orb.top,
            width: orb.size,
            height: orb.size,
            opacity: orb.opacity,
            animationDelay: orb.delay,
          }}
        />
      ))}
    </div>
  );
}

function ScreenSpaceCellMotes() {
  const motes = useMemo(() => {
    const items = [];

    while (items.length < 24) {
      const x = Math.random() * 100;
      const y = Math.random() * 100;
      const dx = (x - 50) / 50;
      const dy = (y - 50) / 50;

      if (dx * dx + dy * dy > 0.92) continue;

      items.push({
        left: `${x}%`,
        top: `${y}%`,
        width: 18 + Math.random() * 30,
        height: 8 + Math.random() * 18,
        opacity: 0.18 + Math.random() * 0.2,
        delay: `${Math.random() * 3}s`,
        duration: `${11 + Math.random() * 10}s`,
        glow: 18 + Math.random() * 26,
        blur: (0.8 + Math.random() * 1.8).toFixed(2),
        rotate: `${-28 + Math.random() * 56}deg`,
        driftX: `${(Math.random() * 28 - 14).toFixed(1)}px`,
        driftY: `${(18 + Math.random() * 26).toFixed(1)}px`,
        scaleTo: (0.92 + Math.random() * 0.24).toFixed(2),
        mode: Math.random() > 0.5 ? "up" : "diagonal",
      });
    }

    return items;
  }, []);

  return (
    <div className="cell-motes" aria-hidden="true">
      {motes.map((mote, index) => (
        <span
          key={index}
          className={`cell-motes__particle cell-motes__particle--${mote.mode}`}
          style={{
            left: mote.left,
            top: mote.top,
            width: `${mote.width}px`,
            height: `${mote.height}px`,
            opacity: mote.opacity,
            animationDelay: mote.delay,
            animationDuration: mote.duration,
            "--mote-opacity": mote.opacity,
            "--mote-rotate": mote.rotate,
            "--mote-drift-x": mote.driftX,
            "--mote-drift-y": `-${mote.driftY}`,
            "--mote-scale": mote.scaleTo,
            "--mote-blur": `${mote.blur}px`,
            "--mote-glow": `${mote.glow}px`,
          }}
        />
      ))}
    </div>
  );
}

function OrganelleNavigator({
  selectedOrganelle,
  onPrevious,
  onNext,
  onBack,
}) {
  if (!selectedOrganelle) return null;

  return (
    <div className="organelle-nav">
      <button className="organelle-nav__btn" onClick={onPrevious} aria-label="Предыдущий органоид">
        ←
      </button>
      <button className="organelle-nav__back" onClick={onBack}>
        Назад
      </button>
      <button className="organelle-nav__btn" onClick={onNext} aria-label="Следующий органоид">
        →
      </button>
    </div>
  );
}

function ProjectInfoPanel({ isOpen, onToggle, onClose }) {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  return (
    <aside className="project-info" aria-label="Информация о проекте">
      <button
        className="project-info__trigger"
        type="button"
        onClick={onToggle}
        aria-label="О проекте"
        aria-expanded={isOpen}
      >
        i
      </button>

      {isOpen && (
        <div className="project-info__panel" role="dialog" aria-modal="false">
          <div className="project-info__header">
            <h2>О проекте</h2>
            <button
              className="project-info__close"
              type="button"
              onClick={onClose}
              aria-label="Закрыть информацию о проекте"
            >
              ×
            </button>
          </div>
          <p className="project-info__text">
            Разработка выполнена в рамках научно-интеллектуального конкурса
            «БиоВижн (BioVision)».
          </p>
          <div className="project-info__section">
            <span className="project-info__label">Проект</span>
            <strong>
              «Мини-атлас клеток и моделирование клеточных структур с помощью ИИ»
            </strong>
          </div>
          <div className="project-info__section">
            <span className="project-info__label">Автор</span>
            <strong>Рыболова Дарья Денисовна</strong>
          </div>
        </div>
      )}
    </aside>
  );
}

export default function App() {
  const [file] = useState("./animal_cell.glb");
  const [sceneRoot, setSceneRoot] = useState(null);
  const [meshList, setMeshList] = useState([]);
  const [hovered, setHovered] = useState(null);
  const [selected, setSelected] = useState(null);
  const [autoRotate, setAutoRotate] = useState(false);
  const [isProjectInfoOpen, setIsProjectInfoOpen] = useState(false);
  const [cinematicTrigger, setCinematicTrigger] = useState(0);
  const [overviewTrigger, setOverviewTrigger] = useState(0);
  const controlsRef = useRef(null);

  const selectedOrganelle = useMemo(() => {
    if (!selected) return null;
    return findOrganelle(selected);
  }, [selected]);

  const selectableOrganelleKeys = useMemo(
    () =>
      Object.keys(ORGANELLES).filter((key) => getOrganellePrimaryMesh(sceneRoot, key)),
    [sceneRoot, meshList]
  );

  const handleLoaded = useCallback((root) => {
    setSceneRoot(root);

    const meshes = [];
    root.traverse((obj) => {
      if (obj.isMesh) meshes.push(obj);
    });

    const usedNames = getUsedObjectNames();

    const ribosomeObjects = meshes
      .map((m) => m.name)
      .filter((name) => name && !usedNames.has(name));

    ORGANELLES.ribosome.objects = ribosomeObjects;

    setMeshList(meshes);
  }, []);

  const resetCamera = useCallback(() => {
    if (!sceneRoot) return;
    const camera = controlsRef.current?.object;
    if (!camera) return;
    fitCameraToObject(camera, controlsRef.current, sceneRoot, 3.5);
  }, [sceneRoot]);

  const focusOrganelleByOffset = useCallback(
    (offset) => {
      if (!selectedOrganelle || selectableOrganelleKeys.length === 0 || !sceneRoot) return;

      const currentIndex = selectableOrganelleKeys.indexOf(selectedOrganelle.key);
      if (currentIndex === -1) return;

      const nextIndex =
        (currentIndex + offset + selectableOrganelleKeys.length) % selectableOrganelleKeys.length;
      const nextMesh = getOrganellePrimaryMesh(sceneRoot, selectableOrganelleKeys[nextIndex]);

      if (nextMesh) {
        setSelected(nextMesh);
      }
    },
    [sceneRoot, selectableOrganelleKeys, selectedOrganelle]
  );

  const handleNavigatePrevious = useCallback(() => {
    focusOrganelleByOffset(-1);
  }, [focusOrganelleByOffset]);

  const handleNavigateNext = useCallback(() => {
    focusOrganelleByOffset(1);
  }, [focusOrganelleByOffset]);

  const handleBackToOverview = useCallback(() => {
    setSelected(null);
    setHovered(null);
    setOverviewTrigger((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!sceneRoot) return;
    const camera = controlsRef.current?.object;
    if (!camera) return;
    fitCameraToObject(camera, controlsRef.current, sceneRoot, 3.5);
  }, [sceneRoot]);

  useEffect(() => {
    if (!selected) return;
    setCinematicTrigger((n) => n + 1);
  }, [selected]);

  return (
    <div className="app-shell app-shell--fullscreen">
      <main
        className="viewer viewer--fullscreen"
      >
        <div className="cell-bg-overlay" />
        <ScreenSpaceAtmosphere />
        <ScreenSpaceCellMotes />
        <div className="topbar">
          <button className="action-btn" onClick={resetCamera}>
            Сбросить камеру
          </button>
          <button
            className="action-btn"
            onClick={() => setAutoRotate((v) => !v)}
          >
            Автовращение: {autoRotate ? "вкл" : "выкл"}
          </button>
        </div>
        <ProjectInfoPanel
          isOpen={isProjectInfoOpen}
          onToggle={() => setIsProjectInfoOpen((value) => !value)}
          onClose={() => setIsProjectInfoOpen(false)}
        />
        <Scene
          file={file}
          sceneRoot={sceneRoot}
          selectedOrganelle={selectedOrganelle}
          onSceneReady={handleLoaded}
          hovered={hovered}
          setHovered={setHovered}
          selected={selected}
          setSelected={setSelected}
          cinematicTrigger={cinematicTrigger}
          overviewTrigger={overviewTrigger}
          autoRotate={autoRotate}
          controlsRef={controlsRef}
        />
        <OrganelleNavigator
          selectedOrganelle={selectedOrganelle}
          onPrevious={handleNavigatePrevious}
          onNext={handleNavigateNext}
          onBack={handleBackToOverview}
        />
      </main>
    </div>
  );
}
