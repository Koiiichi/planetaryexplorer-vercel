"use client";

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import * as THREE from 'three';

type ImageData = {
  image: string;
  title: string;
  keywords: string[];
  color: string;
  planet?: string;
  lat?: number;
  lon?: number;
  zoom?: number;
  feature_type?: string;
};

const getPlanetaryThumbnail = (body: string, lat: number, lon: number, zoom: number = 3): string => {
  const lonLatToTileXY = (lon: number, lat: number, z: number) => {
    const cols = Math.max(1, Math.pow(2, z + 1));
    const rows = Math.max(1, Math.pow(2, z));
    let x = Math.floor(((lon + 180) / 360) * cols);
    let y = Math.floor(((90 - lat) / 180) * rows);
    x = ((x % cols) + cols) % cols;
    y = Math.min(Math.max(y, 0), rows - 1);
    return { x, y };
  };

  const { x, y } = lonLatToTileXY(lon, lat, zoom);
  let tileUrl = '';
  
  switch (body.toLowerCase()) {
    case 'moon':
      tileUrl = `https://trek.nasa.gov/tiles/Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02/1.0.0/default/default028mm/${zoom}/${y}/${x}.jpg`;
      break;
    case 'mars':
      tileUrl = `https://trek.nasa.gov/tiles/Mars/EQ/Mars_MGS_MOLA_ClrShade_merge_global_463m/1.0.0/default/default028mm/${zoom}/${y}/${x}.jpg`;
      break;
    case 'mercury':
      tileUrl = `https://trek.nasa.gov/tiles/Mercury/EQ/Mercury_MESSENGER_MDIS_Basemap_EnhancedColor_Mosaic_Global_665m/1.0.0/default/default028mm/${zoom}/${y}/${x}.jpg`;
      break;
    default:
      return `https://picsum.photos/256/256?random=${Math.floor(Math.random() * 1000)}`;
  }
  
  return `/api/tiles/wmts?url=${encodeURIComponent(tileUrl)}`;
};

export default function PhotoSphereGallery() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const [navHintText] = useState('Made with ❤️ by Slack Overflow');
  const [isNavHintVisible, setIsNavHintVisible] = useState(false);
  const [imageData, setImageData] = useState<ImageData[]>([]);
  
  const sceneRef = useRef<{
    animationId: number | null;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const palette = ['#FFD700', '#FF6B6B', '#4ECDC4', '#95E1D3', '#F38181', '#AA96DA'];

    async function loadGazetteerImages() {
      try {
        const bodies = ['moon', 'mars', 'mercury'];
        const planetFeatures: Record<string, Array<{ name: string; lat: number; lon: number }>> = {};
        
        for (const body of bodies) {
          try {
            const response = await fetch(`/api/features/${body}`);
            if (response.ok) {
              const bodyFeatures = await response.json();
              planetFeatures[body] = bodyFeatures.slice(0, 50).map((f: any) => ({
                name: f.name,
                lat: f.lat,
                lon: f.lon
              }));
            } else {
              planetFeatures[body] = [];
            }
          } catch {
            planetFeatures[body] = [];
          }
        }
        
        const totalRequested = bodies.length;
        const totalLoaded = Object.values(planetFeatures).reduce((sum, arr) => sum + arr.length, 0);
        const failedCount = Object.values(planetFeatures).filter(arr => arr.length === 0).length;
        const sampleNames = Object.entries(planetFeatures)
          .filter(([, feats]) => feats.length > 0)
          .flatMap(([body, feats]) => feats.slice(0, 3).map(f => `${body}:${f.name}`))
          .slice(0, 5);
        
        console.log('Photosphere loader stats:', {
          requested: totalRequested,
          loaded: totalLoaded,
          failed: failedCount,
          sampleNames
        });
        
        console.assert(totalLoaded >= 12, `Photosphere: expected at least 12 images loaded, got ${totalLoaded}`);

        const generated: ImageData[] = [];
        const maxPerBody = 17;
        const zoom = 3;

        for (const [body, features] of Object.entries(planetFeatures)) {
          const shuffled = [...features].sort(() => Math.random() - 0.5);
          const toAdd = shuffled.slice(0, maxPerBody);
          
          for (const feature of toAdd) {
            const thumbnailUrl = getPlanetaryThumbnail(body, feature.lat, feature.lon, zoom);
            
            generated.push({
              image: thumbnailUrl,
              title: `${feature.name}`,
              keywords: [body, feature.name],
              color: palette[generated.length % palette.length],
              planet: body,
              lat: feature.lat,
              lon: feature.lon,
              zoom: zoom,
            });
          }
        }

        if (!cancelled && generated.length > 0) {
          setImageData(generated.slice(0, 50));
        }
      } catch (error) {
        console.error('Error loading gazetteer images:', error);
      }
    }

    loadGazetteerImages();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!containerRef.current || !imageData || imageData.length === 0) return;

    const container = containerRef.current;
    const RADIUS = 15;
    const tiles = imageData.slice(0, 50);
    const COUNT = tiles.length;

    const scene = new THREE.Scene();
    scene.background = null;

    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 40;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(renderer.domElement);

    const group = new THREE.Group();
    scene.add(group);

    const ambient = new THREE.AmbientLight(0xffffff, 1.0);
    scene.add(ambient);

    const sprites: THREE.Sprite[] = [];
    let isDragging = false;
    let prevX = 0;
    let prevY = 0;
    let vel = 0;
    let velY = 0;
    let isFocused = false;
    
    // Hover-hold mechanics
    let hoveredSprite: THREE.Sprite | null = null;
    let hoverStartTime = 0;
    const HOLD_THRESHOLD_MS = 5000;
    let baseSpinSpeed = 0.002;

    function scatteredSpherePoints(N: number) {
      const points: THREE.Vector3[] = [];
      const goldenAngle = Math.PI * (3 - Math.sqrt(5));
      
      for (let i = 0; i < N; i++) {
        const offset = (Math.random() - 0.5) * 0.3;
        const y = 1 - (i / (N - 1)) * 2 + offset;
        const radiusAtY = Math.sqrt(1 - y * y);
        const theta = i * goldenAngle + (Math.random() - 0.5) * 0.5;
        const x = Math.cos(theta) * radiusAtY;
        const z = Math.sin(theta) * radiusAtY;
        points.push(new THREE.Vector3(x, y, z));
      }
      return points;
    }

    const positions = scatteredSpherePoints(COUNT);
    const textureLoader = new THREE.TextureLoader();

    for (let i = 0; i < COUNT; i++) {
      const data = tiles[i % tiles.length];
      
      textureLoader.load(
        data.image,
        (texture) => {
          const mat = new THREE.SpriteMaterial({ map: texture });
          const sprite = new THREE.Sprite(mat);
          
          const sizeVariation = 2.5 + Math.random() * 1;
          sprite.scale.set(sizeVariation, sizeVariation, 1);
          
          const p = positions[i].clone().multiplyScalar(RADIUS);
          sprite.position.copy(p);
          
          sprite.userData = { 
            index: i, 
            title: data.title,
            keywords: data.keywords,
            color: data.color,
            originalScale: sizeVariation,
            planet: data.planet,
            lat: data.lat,
            lon: data.lon,
            zoom: data.zoom
          };
          
          group.add(sprite);
          sprites.push(sprite);
        },
        undefined,
        () => {
          const canvas = document.createElement('canvas');
          canvas.width = 256;
          canvas.height = 256;
          const ctx = canvas.getContext('2d');
          
          if (ctx) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, 256, 256);
            ctx.fillStyle = data.color;
            ctx.fillRect(0, 0, 256, 60);
            ctx.fillStyle = '#000000';
            ctx.font = 'bold 20px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(data.title, 128, 140);
          }
          
          const texture = new THREE.CanvasTexture(canvas);
          const mat = new THREE.SpriteMaterial({ map: texture });
          const sprite = new THREE.Sprite(mat);
          
          const sizeVariation = 2.5 + Math.random() * 1;
          sprite.scale.set(sizeVariation, sizeVariation, 1);
          
          const p = positions[i].clone().multiplyScalar(RADIUS);
          sprite.position.copy(p);
          
          sprite.userData = { 
            index: i, 
            title: data.title,
            keywords: data.keywords,
            color: data.color,
            originalScale: sizeVariation,
            planet: data.planet,
            lat: data.lat,
            lon: data.lon,
            zoom: data.zoom
          };
          
          group.add(sprite);
          sprites.push(sprite);
        }
      );
    }

    function focusOnImage(sprite: THREE.Sprite) {
      isFocused = true;
      sprites.forEach(s => {
        if (s !== sprite) {
          s.material.opacity = 0.15;
          s.material.transparent = true;
        } else {
          s.material.opacity = 1;
          s.scale.set(5, 5, 1);
        }
      });

      const target = new THREE.Vector3();
      sprite.getWorldPosition(target);
      const start = camera.position.clone();
      const direction = target.clone().normalize();
      const end = target.clone().add(direction.multiplyScalar(8));

      let t = 0;
      function zoomAnim() {
        if (t < 1) {
          t += 0.02;
          camera.position.lerpVectors(start, end, t);
          camera.lookAt(target);
          requestAnimationFrame(zoomAnim);
        }
      }
      zoomAnim();
    }

    function resetFocus() {
      isFocused = false;
      sprites.forEach(s => {
        s.material.opacity = 1;
        s.material.transparent = false;
        const originalScale = s.userData.originalScale || 3;
        s.scale.set(originalScale, originalScale, 1);
      });

      const start = camera.position.clone();
      const end = new THREE.Vector3(0, 0, 22);

      let t = 0;
      function resetAnim() {
        if (t < 1) {
          t += 0.02;
          camera.position.lerpVectors(start, end, t);
          camera.lookAt(0, 0, 0);
          requestAnimationFrame(resetAnim);
        }
      }
      resetAnim();
    }

    const handlePointerDown = (e: PointerEvent) => {
      if (isFocused) return;
      isDragging = true;
      prevX = e.clientX;
      prevY = e.clientY;
    };

    const handlePointerUp = () => {
      isDragging = false;
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (!isDragging) {
        // Check for hover
        const rect = renderer.domElement.getBoundingClientRect();
        const mouse = new THREE.Vector2(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          -((e.clientY - rect.top) / rect.height) * 2 + 1
        );
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(group.children, true);
        
        if (intersects.length > 0) {
          const sprite = intersects[0].object as THREE.Sprite;
          if (hoveredSprite !== sprite) {
            hoveredSprite = sprite;
            hoverStartTime = Date.now();
          }
        } else {
          hoveredSprite = null;
          hoverStartTime = 0;
        }
        return;
      }
      
      // Dragging logic
      const dx = e.clientX - prevX;
      const dy = e.clientY - prevY;
      prevX = e.clientX;
      prevY = e.clientY;
      
      group.rotation.y += dx * 0.005;
      vel = dx * 0.002;
      
      group.rotation.x += dy * 0.005;
      group.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, group.rotation.x));
      velY = dy * 0.002;
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const zoomSpeed = 0.1;
      const delta = e.deltaY > 0 ? zoomSpeed : -zoomSpeed;
      camera.position.z += delta;
      camera.position.z = Math.max(10, Math.min(50, camera.position.z));
    };

    const navigateToTarget = (targetData: { planet: string; lat: number; lon: number; zoom?: number; title?: string }) => {
      const { planet, lat, lon, zoom = 10, title } = targetData;
      
      const fadeOut = () => {
        return new Promise<void>((resolve) => {
          let opacity = 1;
          const fadeStep = () => {
            opacity -= 0.05;
            if (container) {
              container.style.opacity = opacity.toString();
            }
            
            if (opacity <= 0) {
              resolve();
            } else {
              requestAnimationFrame(fadeStep);
            }
          };
          fadeStep();
        });
      };
      
      fadeOut().then(() => {
        const params = new URLSearchParams({
          body: planet,
          lat: lat.toString(),
          lon: lon.toString(),
          zoom: zoom.toString()
        });
        
        console.log('ui.flow', 'home_card_clicked', { planet, feature: title, coordinates: [lat, lon] });
        router.push(`/explorer?${params.toString()}`);
      });
    };

    const handleClick = (ev: MouseEvent) => {
      if (isFocused) {
        resetFocus();
        return;
      }

      const rect = renderer.domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((ev.clientX - rect.left) / rect.width) * 2 - 1,
        -((ev.clientY - rect.top) / rect.height) * 2 + 1
      );
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(group.children, true);
      if (intersects.length > 0) {
        const picked = intersects[0].object as THREE.Sprite;
        if (picked.userData && picked.userData.title) {
          const { planet, lat, lon, zoom } = picked.userData;
          if (planet && lat !== undefined && lon !== undefined) {
            navigateToTarget({ planet, lat, lon, zoom, title: picked.userData.title });
          }
        }
      }
    };

    const handleDoubleClick = (ev: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((ev.clientX - rect.left) / rect.width) * 2 - 1,
        -((ev.clientY - rect.top) / rect.height) * 2 + 1
      );
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(group.children, true);
      if (intersects.length > 0) {
        const picked = intersects[0].object as THREE.Sprite;
        if (picked.userData && picked.userData.title) {
          focusOnImage(picked);
        }
      }
    };

    renderer.domElement.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointermove', handlePointerMove);
    renderer.domElement.addEventListener('click', handleClick);
    renderer.domElement.addEventListener('dblclick', handleDoubleClick);
    renderer.domElement.addEventListener('wheel', handleWheel, { passive: false });

    function animate() {
      const id = requestAnimationFrame(animate);
      if (sceneRef.current) {
        sceneRef.current.animationId = id;
      }

      // Check hover-hold for slow spin
      let spinMultiplier = 1.0;
      if (hoveredSprite && hoverStartTime > 0) {
        const hoverDuration = Date.now() - hoverStartTime;
        if (hoverDuration >= HOLD_THRESHOLD_MS) {
          spinMultiplier = 0.25; // Slow spin
        }
      }

      if (!isDragging && !isFocused) {
        group.rotation.y += (baseSpinSpeed * spinMultiplier) + (vel * 0.01);
        vel *= 0.95;
        group.rotation.x += velY * 0.01;
        group.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, group.rotation.x));
        velY *= 0.95;
      }
      
      renderer.render(scene, camera);
    }
    animate();

    sceneRef.current = { animationId: null };

    setTimeout(() => {
      setIsNavHintVisible(true);
      const start = camera.position.clone();
      const end = new THREE.Vector3(0, 0, 22);
      let t = 0;
      function zoomIntoMiddle() {
        if (t < 1) {
          t += 0.015;
          camera.position.lerpVectors(start, end, t);
          camera.lookAt(0, 0, 0);
          requestAnimationFrame(zoomIntoMiddle);
        }
      }
      zoomIntoMiddle();
    }, 3000);

    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointermove', handlePointerMove);
      renderer.domElement.removeEventListener('click', handleClick);
      renderer.domElement.removeEventListener('dblclick', handleDoubleClick);
      renderer.domElement.removeEventListener('wheel', handleWheel);
      
      if (sceneRef.current?.animationId) {
        cancelAnimationFrame(sceneRef.current.animationId);
      }
      renderer.dispose();
      if (container && renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [imageData, router]);

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="absolute inset-0 w-full h-full" />
      <div className={`fixed bottom-10 left-1/2 -translate-x-1/2 text-white-400 text-sm z-10 transition-opacity duration-500 ${isNavHintVisible ? 'opacity-100' : 'opacity-0'}`}>
        {navHintText}
      </div>
    </div>
  );
}
