"use client";

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import * as THREE from 'three';
import JSZip from 'jszip';
// @ts-ignore - togeojson doesn't have types
import toGeoJSON from 'togeojson';

type DatasetListItem = {
  id: string;
  title: string;
  body?: string | null;
};

type ViewerConfigResponse = {
  id: string;
  title: string;
  tile_url_template: string;
  min_zoom: number;
  max_zoom: number;
  tile_size: number;
  projection?: string | null;
  attribution?: string | null;
  body?: string | null;
};

type ImageData = {
  image: string;
  title: string;
  keywords: string[];
  color: string;
  planet?: string;
  lat?: number;
  lon?: number;
  zoom?: number;
};

const DEFAULT_IMAGE_DATA: ImageData[] = [
  { image: 'https://picsum.photos/256/256?random=1', title: 'Moonlit Plains', keywords: ['fallback', 'moon'], color: '#FFD700' },
  { image: 'https://picsum.photos/256/256?random=2', title: 'Crater Valley', keywords: ['fallback', 'mars'], color: '#FF6B6B' },
  { image: 'https://picsum.photos/256/256?random=3', title: 'Mercury Ridge', keywords: ['fallback', 'mercury'], color: '#4ECDC4' },
  { image: 'https://picsum.photos/256/256?random=4', title: 'Ceres Dawn', keywords: ['fallback', 'ceres'], color: '#95E1D3' }
];

// Enhanced thumbnail generation with fallback options
const getPlanetaryThumbnail = (body: string, lat: number, lon: number, zoom: number = 3): string => {
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
  
  // Try backend thumbnail endpoint first (with better caching and error handling)
  if (backendUrl) {
    const params = new URLSearchParams({
      lat: lat.toString(),
      lon: lon.toString(),
      zoom: zoom.toString(),
      size: '256'
    });
    return `${backendUrl}/thumbnail/${body.toLowerCase()}?${params.toString()}`;
  }
  
  // Fallback to direct NASA TREK servers
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
  
  switch (body.toLowerCase()) {
    case 'moon':
      return `https://trek.nasa.gov/tiles/Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02/1.0.0/default/default028mm/${zoom}/${y}/${x}.jpg`;
    case 'mars':
      return `https://trek.nasa.gov/tiles/Mars/EQ/Mars_MGS_MOLA_ClrShade_merge_global_463m/1.0.0/default/default028mm/${zoom}/${y}/${x}.jpg`;
    case 'mercury':
      return `https://trek.nasa.gov/tiles/Mercury/EQ/Mercury_MESSENGER_MDIS_Basemap_EnhancedColor_Mosaic_Global_665m/1.0.0/default/default028mm/${zoom}/${y}/${x}.jpg`;
    default:
      return `https://picsum.photos/256/256?random=${Math.floor(Math.random() * 1000)}`;
  }
};

export default function PhotoSphereGallery() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const [navHintText, setNavHintText] = useState('Made with ❤️ by Slack Overflow');
  const [isNavHintVisible, setIsNavHintVisible] = useState(false);
  const [imageData, setImageData] = useState<ImageData[]>(DEFAULT_IMAGE_DATA);
  
  const sceneRef = useRef<{
    animationId: number | null;
  } | null>(null);

  useEffect(() => {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
    if (!backendUrl) {
      return;
    }

    let cancelled = false;
    const palette = ['#FFD700', '#FF6B6B', '#4ECDC4', '#95E1D3', '#F38181', '#AA96DA', '#FCBAD3', '#A8D8EA', '#FFE66D', '#C7CEEA'];

    const fillTemplate = (template: string, z: number, x: number, y: number) =>
      template
        .replace(/{z}/g, String(z))
        .replace(/{x}/g, String(x))
        .replace(/{y}/g, String(y))
        .replace(/{col}/g, String(x))
        .replace(/{row}/g, String(y));

    const randomInt = (min: number, max: number) => {
      if (min === max) return min;
      return Math.floor(Math.random() * (max - min + 1)) + min;
    };

    async function loadTiles() {
      try {
        const listRes = await fetch(`${backendUrl}/viewer/layers`);
        if (!listRes.ok) {
          throw new Error('Failed to load layer list');
        }

        const layers = (await listRes.json()) as DatasetListItem[];
        if (!layers.length) return;

        // fetch full configs
        const configs = (
          await Promise.all(
            layers.map(async (layer) => {
              try {
                const res = await fetch(`${backendUrl}/viewer/layers/${layer.id}`);
                if (!res.ok) return null;
                const config = (await res.json()) as ViewerConfigResponse;
                return { layer, config };
              } catch (error) {
                console.error('Config fetch failed', error);
                return null;
              }
            })
          )
        ).filter(Boolean) as Array<{ layer: DatasetListItem; config: ViewerConfigResponse }>;

        if (!configs.length) {
          setImageData(DEFAULT_IMAGE_DATA.slice(0, 50));
          return;
        }

        // --- helpers ---
        const kmzProxy = (url: string) => `${backendUrl}/proxy/kmz?url=${encodeURIComponent(url)}`;

        async function fetchGazetteerKMZ(kmzUrl: string) {
          try {
            const r = await fetch(kmzProxy(kmzUrl));
            if (!r.ok) return [];
            const buf = await r.arrayBuffer();
            const zip = await JSZip.loadAsync(buf);
            const kmlName = Object.keys(zip.files).find((n) => n.toLowerCase().endsWith('.kml'));
            if (!kmlName) return [];
            const kmlText = await zip.files[kmlName].async('text');
            const kmlDoc = new DOMParser().parseFromString(kmlText, 'application/xml');
            const gj = (toGeoJSON as any).kml(kmlDoc);
            const pts: Array<{ name: string; lat: number; lon: number }> = [];
            for (const f of gj.features || []) {
              if (f.geometry?.type !== 'Point') continue;
              const [lon, lat] = f.geometry.coordinates || [];
              if (typeof lat !== 'number' || typeof lon !== 'number') continue;
              pts.push({
                name: f.properties?.name || f.properties?.Name || 'unnamed',
                lat,
                lon,
              });
            }
            return pts;
          } catch (e) {
            console.warn('KMZ parse failed', e);
            return [];
          }
        }

        function lonLatToTileXY(lon: number, lat: number, z: number) {
          const cols = Math.max(1, Math.pow(2, z + 1));
          const rows = Math.max(1, Math.pow(2, z));
          let x = Math.floor(((lon + 180) / 360) * cols);
          let y = Math.floor(((90 - lat) / 180) * rows);
          x = ((x % cols) + cols) % cols;
          y = Math.min(Math.max(y, 0), rows - 1);
          return { x, y };
        }

        // Function to load features from local JSON files  
        async function loadLocalFeatures() {
          const features: Record<string, Array<{ name: string; lat: number; lon: number }>> = {};
          const bodies = ['moon', 'mars', 'mercury'];
          
          for (const body of bodies) {
            try {
              const response = await fetch(`/api/features/${body}`);
              if (response.ok) {
                const bodyFeatures = await response.json();
                features[body] = bodyFeatures.slice(0, 200).map((f: any) => ({
                  name: f.name,
                  lat: f.lat,
                  lon: f.lon
                }));
              } else {
                console.warn(`Failed to load ${body} features from API`);
                features[body] = [];
              }
            } catch (error) {
              console.warn(`Error loading ${body} features:`, error);
              features[body] = [];
            }
          }
          return features;
        }
        
        const palette = ['#FFD700', '#FF6B6B', '#4ECDC4', '#95E1D3', '#F38181', '#AA96DA', '#FCBAD3', '#A8D8EA', '#FFE66D', '#C7CEEA'];
        const TILE_COUNT = 50;

        // Index configs by body for easier matching
        const cfgByBody = new Map<string, { layer: DatasetListItem; config: ViewerConfigResponse }[]>();
        for (const item of configs) {
          const key = (item.config.body || item.layer.body || 'unknown').toLowerCase();
          const arr = cfgByBody.get(key) || [];
          arr.push(item);
          cfgByBody.set(key, arr);
        }

        // Load feature sets from all available planets
        const planetKmzUrls = {
          moon: 'https://asc-planetarynames-data.s3.us-west-2.amazonaws.com/MOON_nomenclature_center_pts.kmz',
          mars: 'https://asc-planetarynames-data.s3.us-west-2.amazonaws.com/MARS_nomenclature_center_pts.kmz',
          mercury: 'https://asc-planetarynames-data.s3.us-west-2.amazonaws.com/MERCURY_nomenclature_center_pts.kmz',
          ceres: 'https://asc-planetarynames-data.s3.us-west-2.amazonaws.com/CERES_nomenclature_center_pts.kmz',
          vesta: 'https://asc-planetarynames-data.s3.us-west-2.amazonaws.com/VESTA_nomenclature_center_pts.kmz'
        };

        const planetFeatures: Record<string, Array<{ name: string; lat: number; lon: number }>> = {};
        
        // Load features from local JSON files first, fallback to KMZ if needed
        try {
          const localFeatures = await loadLocalFeatures();
          Object.assign(planetFeatures, localFeatures);
          
          // Log stats
          const totalLoaded = Object.values(planetFeatures).reduce((sum, arr) => sum + arr.length, 0);
          const sampleNames = Object.entries(planetFeatures)
            .filter(([, feats]) => feats.length > 0)
            .map(([body, feats]) => `${body}:${feats.slice(0, 3).map(f => f.name).join(',')}`)
            .slice(0, 5);
          
          console.log(`Photosphere loader stats:`, {
            totalRequested: Object.keys(planetFeatures).length,
            totalLoaded,
            failedCount: Object.values(planetFeatures).filter(arr => arr.length === 0).length,
            sampleNames
          });
          
          console.assert(totalLoaded >= 12, "Photosphere: expected at least 12 images loaded");
        } catch (error) {
          console.warn('Failed to load local features, falling back to KMZ:', error);
          
          // Fallback to KMZ loading
          await Promise.all(
            Object.entries(planetKmzUrls).map(async ([planet, url]) => {
              try {
                const features = await fetchGazetteerKMZ(url);
                planetFeatures[planet] = features;
                console.log(`Loaded ${features.length} features for ${planet}`);
              } catch (error) {
                console.warn(`Failed to load features for ${planet}:`, error);
                planetFeatures[planet] = [];
              }
            })
          );
        }

        // Build images from features using the corresponding body layer configs
        const generated: ImageData[] = [];
        const used = new Set<string>();

        function pushFromFeatures(bodyKey: string, feats: Array<{ name: string; lat: number; lon: number }>, maxFromThisPlanet: number = 15) {
          const entries = cfgByBody.get(bodyKey);
          if (!entries || !entries.length || !feats.length) return;

          // Prefer a single representative layer for consistency (first one)
          const { layer, config } = entries[0];

          // choose a crisp zoom (max-1) within bounds
          const z = Math.max(config.min_zoom, Math.min(config.max_zoom, config.max_zoom - 1));

          // Shuffle features to get variety and limit per planet for better distribution
          const shuffledFeats = [...feats].sort(() => Math.random() - 0.5);
          let addedFromThisPlanet = 0;

          // Prioritize named features as-is (already have names), no randoms
          for (const f of shuffledFeats) {
            if (addedFromThisPlanet >= maxFromThisPlanet || generated.length >= TILE_COUNT) break;
            
            const { x, y } = lonLatToTileXY(f.lon, f.lat, z);
            const key = `${config.id ?? layer.id}:${z}:${x}:${y}`;
            if (used.has(key)) continue;
            used.add(key);

            // Use optimized thumbnail generation with retry logic
            const thumbnailUrl = getPlanetaryThumbnail(bodyKey, f.lat, f.lon, z);
            
            console.log(`Generated thumbnail for ${f.name}: ${thumbnailUrl}`);
            generated.push({
              image: thumbnailUrl,
              title: `${f.name} — ${layer.title} (z${z})`,
              keywords: [bodyKey, layer.title, f.name],
              color: palette[generated.length % palette.length],
              planet: bodyKey,
              lat: f.lat,
              lon: f.lon,
              zoom: z,
            });

            addedFromThisPlanet++;
          }
        }

        // Process features from all planets with balanced distribution
        const planetLimits = {
          'moon': 12,
          'mars': 12, 
          'mercury': 10,
          'ceres': 8,
          'vesta': 8
        };
        
        const planetsToProcess = ['moon', 'mars', 'mercury', 'ceres', 'vesta'];
        for (const planet of planetsToProcess) {
          if (generated.length >= TILE_COUNT) break;
          const features = planetFeatures[planet] || [];
          const maxForThisPlanet = planetLimits[planet as keyof typeof planetLimits] || 10;
          if (features.length > 0) {
            pushFromFeatures(planet, features, maxForThisPlanet);
            console.log(`Added ${Math.min(features.length, maxForThisPlanet)} images from ${planet} (${features.length} features available)`);
          }
        }

        // If still short, optionally backfill with any remaining layers/tiles at random (keeps demo robust)
        if (generated.length < TILE_COUNT) {
          for (let i = 0; i < 500 && generated.length < TILE_COUNT; i++) {
            const pick = configs[Math.floor(Math.random() * configs.length)];
            const { layer, config } = pick;
            const z = Math.max(config.min_zoom, Math.min(config.max_zoom, config.max_zoom - 1));
            const cols = Math.max(1, Math.pow(2, z + 1));
            const rows = Math.max(1, Math.pow(2, z));
            const x = Math.floor(Math.random() * cols);
            const y = Math.floor(Math.random() * rows);
            const key = `${config.id ?? layer.id}:${z}:${x}:${y}`;
            if (used.has(key)) continue;
            used.add(key);

            const url = fillTemplate(config.tile_url_template, z, x, y);
            generated.push({
              image: url,
              title: `${layer.title} (z${z})`,
              keywords: [layer.body ?? layer.id, layer.title],
              color: palette[generated.length % palette.length],
            });
          }
        }

        if (!cancelled && generated.length) {
          setImageData(generated.slice(0, TILE_COUNT));
        }
      } catch (error) {
        console.error('Falling back to default imagery', error);
        if (!cancelled) {
          setImageData(DEFAULT_IMAGE_DATA.slice(0, 50));
        }
      }
    }

    loadTiles();

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

    // Scene setup
    const scene = new THREE.Scene();
    // Transparent background to show the starfield
    scene.background = null;

    const camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    camera.position.z = 40;

    const renderer = new THREE.WebGLRenderer({ 
      antialias: true,
      alpha: true // Enable transparency
    });
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

    // Scattered sphere distribution
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

    // Create sprites with images
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
          // Fallback if image fails
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
            ctx.strokeStyle = '#e0e0e0';
            ctx.lineWidth = 4;
            ctx.strokeRect(0, 0, 256, 256);
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

    // Focus on image function
    function focusOnImage(sprite: THREE.Sprite) {
      isFocused = true;
      setNavHintText('Single-click to go back');

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

    // Reset focus function
    function resetFocus() {
      isFocused = false;
      setNavHintText('x');

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

    // Mouse interaction handlers
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
      if (!isDragging) return;
      const dx = e.clientX - prevX;
      const dy = e.clientY - prevY;
      prevX = e.clientX;
      prevY = e.clientY;
      
      // Rotate horizontally
      group.rotation.y += dx * 0.005;
      vel = dx * 0.002;
      
      // Rotate vertically with constraints to prevent flipping
      group.rotation.x += dy * 0.005;
      group.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, group.rotation.x));
      velY = dy * 0.002;
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      
      // Zoom in/out with mouse wheel
      const zoomSpeed = 0.1;
      const delta = e.deltaY > 0 ? zoomSpeed : -zoomSpeed;
      
      camera.position.z += delta;
      
      // Constrain zoom limits
      camera.position.z = Math.max(10, Math.min(50, camera.position.z));
    };

    // Google Earth style navigation function
    const navigateToTarget = (targetData: { planet: string; lat: number; lon: number; zoom?: number; title?: string }) => {
      const { planet, lat, lon, zoom = 10, title } = targetData;
      
      // Smooth fade out photosphere
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
      
      // Execute navigation
      fadeOut().then(() => {
        const params = new URLSearchParams({
          body: planet,
          lat: lat.toString(),
          lon: lon.toString(),
          zoom: zoom.toString()
        });
        
        console.log('ui.flow', 'home_card_clicked', {
          planet,
          feature: title,
          coordinates: [lat, lon]
        });
        
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
            // Use Google Earth style navigation
            navigateToTarget({ planet, lat, lon, zoom, title: picked.userData.title });
          } else {
            // Fallback for images without location data
            alert(`Viewing: ${picked.userData.title}`);
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

    // Add event listeners
    renderer.domElement.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointermove', handlePointerMove);
    renderer.domElement.addEventListener('click', handleClick);
    renderer.domElement.addEventListener('dblclick', handleDoubleClick);
    renderer.domElement.addEventListener('wheel', handleWheel, { passive: false });

    // Animation loop
    function animate() {
      const id = requestAnimationFrame(animate);
      if (sceneRef.current) {
        sceneRef.current.animationId = id;
      }

      if (!isDragging && !isFocused) {
        group.rotation.y += 0.002 + (vel * 0.01);
        vel *= 0.95;
        
        // Apply vertical velocity decay
        group.rotation.x += velY * 0.01;
        group.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, group.rotation.x));
        velY *= 0.95;
      }
      
      renderer.render(scene, camera);
    }
    animate();

    // Store references
    sceneRef.current = {
      animationId: null
    };

    // Initial zoom and show hint
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

    // Handle resize
    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    // Cleanup
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
  }, [imageData]);

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="absolute inset-0 w-full h-full" />
      
      {/* Navigation hint */}
      <div 
        className={`
          fixed bottom-10 left-1/2 -translate-x-1/2
          text-white-400 text-sm z-10
          transition-opacity duration-500
          ${isNavHintVisible ? 'opacity-100' : 'opacity-0'}
        `}
      >
        {navHintText}
      </div>
    </div>
  );
}
