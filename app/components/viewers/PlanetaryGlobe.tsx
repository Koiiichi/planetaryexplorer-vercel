"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import type { PlanetaryBodyKey } from "@/app/lib/planetary/constants";
import {
  getDatasetById,
  getDefaultDatasetForBody,
  type DatasetMetadata,
} from "@/app/lib/planetary/datasets";
import { getReferenceFeatures } from "@/app/lib/planetary/referenceFeatures";

const DEFAULT_RADIUS = 1;

interface PlanetaryGlobeProps {
  body: PlanetaryBodyKey;
  baseDatasetId?: string;
  projectionDebugEnabled?: boolean;
  referenceFeaturesEnabled?: boolean;
  hiResDatasetId?: string | null;
  elevationDatasetId?: string | null;
  stateInspectorEnabled?: boolean;
  initialLat?: number;
  initialLon?: number;
  onFeatureSelected?: (feature: {
    name: string;
    lat: number;
    lon: number;
    category?: string;
    diameter_km?: number;
    body: string;
  }) => void;
}

interface GlobeInspectorSnapshot {
  ready: boolean;
  lat: number;
  lon: number;
  distance: number;
}

function computeTextureUrl(dataset: DatasetMetadata): string {
  const { minZoom } = dataset.tiling;
  const url = dataset.template
    .replace(/{z}/g, String(minZoom))
    .replace(/{row}/g, "0")
    .replace(/{col}/g, "0")
    .replace(/{x}/g, "0")
    .replace(/{y}/g, "0");
  return url;
}

function latLonToVector3(
  lat: number,
  lon: number,
  radius: number
): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);

  const x = -radius * Math.sin(phi) * Math.cos(theta);
  const z = radius * Math.sin(phi) * Math.sin(theta);
  const y = radius * Math.cos(phi);

  return new THREE.Vector3(x, y, z);
}

export default function PlanetaryGlobe({
  body,
  baseDatasetId,
  projectionDebugEnabled = false,
  referenceFeaturesEnabled = false,
  hiResDatasetId,
  elevationDatasetId,
  stateInspectorEnabled = false,
  initialLat,
  initialLon,
  onFeatureSelected,
}: PlanetaryGlobeProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const highlightRef = useRef<THREE.Sprite | null>(null);
  const [inspectorSnapshot, setInspectorSnapshot] =
    useState<GlobeInspectorSnapshot>({
      ready: false,
      lat: 0,
      lon: 0,
      distance: 0,
    });

  const baseDataset = useMemo<DatasetMetadata | undefined>(() => {
    if (baseDatasetId) return getDatasetById(baseDatasetId);
    return getDefaultDatasetForBody(body);
  }, [baseDatasetId, body]);

  const hiResDataset = useMemo(
    () => (hiResDatasetId ? getDatasetById(hiResDatasetId) : undefined),
    [hiResDatasetId]
  );

  const elevationDataset = useMemo(
    () => (elevationDatasetId ? getDatasetById(elevationDatasetId) : undefined),
    [elevationDatasetId]
  );

  useEffect(() => {
    let renderer: THREE.WebGLRenderer | null = null;
    let scene: THREE.Scene | null = null;
    let camera: THREE.PerspectiveCamera | null = null;
    let controls: OrbitControls | null = null;
    let animationId = 0;
    let overlaySphereHiRes: THREE.Mesh | null = null;
    let overlaySphereElevation: THREE.Mesh | null = null;
    let gridObject: THREE.LineSegments | null = null;

    const container = containerRef.current;
    if (!container || !baseDataset) {
      return;
    }

    const rect = container.getBoundingClientRect();

    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
    });
    renderer.setSize(rect.width, rect.height);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(45, rect.width / rect.height, 0.1, 100);
    camera.position.set(0, 0, 3);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.enablePan = false;
    controls.minDistance = 1.2;
    controls.maxDistance = 6;

    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambient);

    const directional = new THREE.DirectionalLight(0xffffff, 0.6);
    directional.position.set(5, 3, 5);
    scene.add(directional);

    const baseGeometry = new THREE.SphereGeometry(DEFAULT_RADIUS, 96, 96);
    const baseMaterial = new THREE.MeshPhongMaterial({
      color: 0x111111,
    });
    const globeMesh = new THREE.Mesh(baseGeometry, baseMaterial);
    scene.add(globeMesh);

    const textureLoader = new THREE.TextureLoader();
    textureLoader.load(
      computeTextureUrl(baseDataset),
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        baseMaterial.map = texture;
        baseMaterial.needsUpdate = true;
        setInspectorSnapshot((prev) => ({ ...prev, ready: true }));
      },
      undefined,
      () => {
        setInspectorSnapshot((prev) => ({ ...prev, ready: false }));
      }
    );

    const overlayGeometry = new THREE.SphereGeometry(DEFAULT_RADIUS * 1.001, 96, 96);

    if (hiResDataset) {
      const hiResMaterial = new THREE.MeshPhongMaterial({
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
      });
      overlaySphereHiRes = new THREE.Mesh(overlayGeometry, hiResMaterial);
      scene.add(overlaySphereHiRes);
      textureLoader.load(computeTextureUrl(hiResDataset), (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        hiResMaterial.map = texture;
        hiResMaterial.needsUpdate = true;
      });
    }

    if (elevationDataset) {
      const elevationMaterial = new THREE.MeshPhongMaterial({
        transparent: true,
        opacity: 0.4,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      overlaySphereElevation = new THREE.Mesh(overlayGeometry, elevationMaterial);
      scene.add(overlaySphereElevation);
      textureLoader.load(computeTextureUrl(elevationDataset), (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        elevationMaterial.map = texture;
        elevationMaterial.needsUpdate = true;
      });
    }

    if (projectionDebugEnabled) {
      const latSegments = 12;
      const lonSegments = 24;
      const material = new THREE.LineBasicMaterial({
        color: 0x3b82f6,
        transparent: true,
        opacity: 0.4,
      });
      const positions: number[] = [];

      for (let i = 0; i <= latSegments; i++) {
        const lat = -90 + (180 / latSegments) * i;
        for (let j = 0; j < lonSegments; j++) {
          const lon1 = -180 + (360 / lonSegments) * j;
          const lon2 = lon1 + 360 / lonSegments;
          const p1 = latLonToVector3(lat, lon1, DEFAULT_RADIUS * 1.002);
          const p2 = latLonToVector3(lat, lon2, DEFAULT_RADIUS * 1.002);
          positions.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
        }
      }

      for (let j = 0; j < lonSegments; j++) {
        const lon = -180 + (360 / lonSegments) * j;
        for (let i = 0; i < latSegments; i++) {
          const lat1 = -90 + (180 / latSegments) * i;
          const lat2 = lat1 + 180 / latSegments;
          const p1 = latLonToVector3(lat1, lon, DEFAULT_RADIUS * 1.002);
          const p2 = latLonToVector3(lat2, lon, DEFAULT_RADIUS * 1.002);
          positions.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
        }
      }

      const gridGeometry = new THREE.BufferGeometry();
      gridGeometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(positions, 3)
      );
      gridObject = new THREE.LineSegments(gridGeometry, material);
      scene.add(gridObject);
    }

    const markerGroup = new THREE.Group();
    if (referenceFeaturesEnabled) {
      const reference = getReferenceFeatures(body);
      const markerMaterial = new THREE.SpriteMaterial({
        color: 0xffffff,
        opacity: 0.85,
      });
      for (const feature of reference) {
        const sprite = new THREE.Sprite(markerMaterial.clone());
        sprite.scale.set(0.03, 0.03, 0.03);
        const position = latLonToVector3(
          feature.lat,
          feature.lon,
          DEFAULT_RADIUS * 1.01
        );
        sprite.position.copy(position);
        markerGroup.add(sprite);
      }
      scene.add(markerGroup);
    }

    const highlightMaterial = new THREE.SpriteMaterial({
      map: new THREE.TextureLoader().load(
        "data:image/svg+xml;charset=utf-8," +
          encodeURIComponent(
            `<svg xmlns='http://www.w3.org/2000/svg' width='128' height='128'><circle cx='64' cy='64' r='30' fill='rgba(59,130,246,0.3)' stroke='rgba(59,130,246,0.9)' stroke-width='4'/></svg>`
          )
      ),
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    highlightRef.current = new THREE.Sprite(highlightMaterial);
    highlightRef.current.scale.set(0.15, 0.15, 0.15);
    scene.add(highlightRef.current);
    if (initialLat !== undefined && initialLon !== undefined) {
      const pos = latLonToVector3(
        initialLat,
        initialLon,
        DEFAULT_RADIUS * 1.01
      );
      highlightRef.current.position.copy(pos);
    }

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const markerTexture = new THREE.TextureLoader().load(
      "data:image/svg+xml;charset=utf-8," +
        encodeURIComponent(
          `<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><circle cx='32' cy='32' r='12' fill='rgba(255,255,255,0.8)' stroke='rgba(59,130,246,0.9)' stroke-width='3'/></svg>`
        )
    );

    const handleClick = (event: MouseEvent) => {
      if (!renderer || !camera) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const intersects = raycaster.intersectObject(globeMesh);
      if (intersects.length) {
        const point = intersects[0].point.clone().normalize();
        const lat = 90 - (Math.acos(point.y) * 180) / Math.PI;
        const lon =
          ((Math.atan2(point.z, -point.x) * 180) / Math.PI) - 180 * 0;
        if (highlightRef.current) {
          const pos = latLonToVector3(lat, lon, DEFAULT_RADIUS * 1.01);
          highlightRef.current.position.copy(pos);
          highlightRef.current.material.map = markerTexture;
          highlightRef.current.material.needsUpdate = true;
        }
        onFeatureSelected?.({
          name: "Selection",
          lat,
          lon,
          body,
        });
      }
    };
    renderer.domElement.addEventListener("dblclick", handleClick);

    const animate = () => {
      if (!renderer || !scene || !camera || !controls) return;
      animationId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);

      if (stateInspectorEnabled && highlightRef.current) {
        const pos = highlightRef.current.position.clone().normalize();
        const lat = 90 - (Math.acos(pos.y) * 180) / Math.PI;
        const lon = ((Math.atan2(pos.z, -pos.x) * 180) / Math.PI);
        setInspectorSnapshot({
          ready: true,
          lat,
          lon,
          distance: controls.getDistance(),
        });
      }
    };

    animate();

    const handleResize = () => {
      if (!renderer || !camera || !container) return;
      const bounds = container.getBoundingClientRect();
      renderer.setSize(bounds.width, bounds.height);
      camera.aspect = bounds.width / bounds.height;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      renderer?.domElement.removeEventListener("dblclick", handleClick);
      cancelAnimationFrame(animationId);
      controls?.dispose();
      renderer?.dispose();
      if (gridObject) {
        gridObject.geometry.dispose();
        scene?.remove(gridObject);
      }
      overlaySphereHiRes?.geometry.dispose();
      overlaySphereElevation?.geometry.dispose();
      highlightRef.current = null;
      if (renderer && container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [
    body,
    baseDataset,
    hiResDataset,
    elevationDataset,
    projectionDebugEnabled,
    referenceFeaturesEnabled,
    stateInspectorEnabled,
    initialLat,
    initialLon,
    onFeatureSelected,
  ]);

  useEffect(() => {
    if (
      highlightRef.current &&
      initialLat !== undefined &&
      initialLon !== undefined
    ) {
      const pos = latLonToVector3(
        initialLat,
        initialLon,
        DEFAULT_RADIUS * 1.01
      );
      highlightRef.current.position.copy(pos);
    }
  }, [initialLat, initialLon]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="absolute inset-0" />
      {stateInspectorEnabled && (
        <div className="absolute bottom-4 right-4 z-40 rounded-lg bg-black/70 px-3 py-2 text-xs text-white/80 backdrop-blur">
          <div className="font-semibold text-white">Globe Inspector</div>
          <div>Ready: {inspectorSnapshot.ready ? "yes" : "no"}</div>
          <div>
            Focus: {inspectorSnapshot.lat.toFixed(2)} deg,{" "}
            {inspectorSnapshot.lon.toFixed(2)} deg
          </div>
          <div>Distance: {inspectorSnapshot.distance.toFixed(2)}</div>
        </div>
      )}
    </div>
  );
}
