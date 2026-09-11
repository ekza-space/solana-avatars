import { useCallback, useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { AvatarModel, measureAvatarSpatialBounds, type AvatarSpatialBounds } from "@ekza/avatar-renderer/model";
import { Group, PerspectiveCamera } from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { validAnimationsNames } from "./animations";

const PREVIEW_AVATAR_HEIGHT = 4;

/** Fit rendered geometry at any size/aspect; source units and morph extrema
 * must not decide how much of the creator's preview the avatar occupies. */
export function framePreviewBounds(bounds: AvatarSpatialBounds, aspect: number, fov: number) {
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  const depth = bounds.maxZ - bounds.minZ;
  if (![width, height, depth, aspect, fov].every(Number.isFinite)
      || height <= 0 || width < 0 || depth < 0 || aspect <= 0 || fov <= 0 || fov >= 180) {
    throw new Error("The model has no measurable visible geometry.");
  }
  const verticalSlope = Math.tan(fov * Math.PI / 360);
  const distance = 1.15 * Math.max(height / (2 * verticalSlope), width / (2 * verticalSlope * aspect)) + depth / 2;
  return {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
    z: (bounds.minZ + bounds.maxZ) / 2,
    distance,
    near: Math.max(0.001, distance / 100),
    far: Math.max(100, distance * 20),
  };
}

interface Properties {
  file: string;
  scale: [number, number, number];
  position: [number, number, number];
  setAnimations: React.Dispatch<React.SetStateAction<string[]>>;
  playAnimation: string;
  onReady?: () => void;
}

export default function UploadedModel(props: Properties) {
  const { file, scale, position, setAnimations, playAnimation, onReady } = props;
  const root = useRef<Group>(null);
  const pendingFit = useRef(false);
  const { camera, controls, size, invalidate } = useThree();

  useEffect(() => {
    pendingFit.current = true;
  }, [size.width, size.height]);

  useFrame(() => {
    if (!pendingFit.current || !root.current || !(camera instanceof PerspectiveCamera)) return;
    // The renderer's callback runs after its model mounts. Measure on the next
    // frame, after its posed/skinned transforms, before declaring this file ready.
    const bounds = measureAvatarSpatialBounds(root.current);
    if (bounds.maxY <= bounds.minY) return;
    const frame = framePreviewBounds(bounds, size.width / Math.max(1, size.height), camera.fov);
    camera.position.set(frame.x, frame.y, frame.z + frame.distance);
    camera.near = frame.near;
    camera.far = frame.far;
    camera.lookAt(frame.x, frame.y, frame.z);
    camera.updateProjectionMatrix();
    const orbit = controls as OrbitControls | null;
    if (orbit) {
      orbit.target.set(frame.x, frame.y, frame.z);
      orbit.minDistance = frame.distance * 0.35;
      orbit.maxDistance = frame.distance * 3;
      orbit.update();
    }
    pendingFit.current = false;
    invalidate();
    onReady?.();
  });

  const handleAnimationsChange = useCallback(
    (animationNames: string[]) => {
      const validModelAnimations = animationNames.filter((name) =>
        validAnimationsNames.includes(name)
      );

      setAnimations(
        validModelAnimations.length > 0
          ? ["tpose", ...validModelAnimations]
          : []
      );
      pendingFit.current = true;
    },
    [setAnimations]
  );

  return (
    <group ref={root} scale={scale} position={position} dispose={null}>
      <AvatarModel
        url={file}
        targetHeight={PREVIEW_AVATAR_HEIGHT}
        animation={playAnimation || undefined}
        onAnimationsChange={handleAnimationsChange}
      />
    </group>
  );
}
