import { useThree } from "@react-three/fiber";
import { useEffect } from "react";
export default function ScreenShot({ trigger, onCapture, onError }: {
  trigger: number;
  onCapture?: (blob: Blob) => void;
  onError?: (message: string) => void;
}) {
  const { gl, scene, camera } = useThree();

  useEffect(() => {
    let active = true;
    // The model has loaded. Wait for its framing/layout before rendering the
    // same scene the creator sees, without changing its tone mapping.
    const frame = requestAnimationFrame(() => {
      try {
        gl.render(scene, camera);
        gl.domElement.toBlob((blob) => {
          if (!active) return;
          if (blob?.size) onCapture?.(blob);
          else onError?.("The preview image could not be captured. Reload the model and retry.");
        }, "image/png");
      } catch {
        if (active) onError?.("The preview image could not be captured. Reload the model and retry.");
      }
    });
    return () => { active = false; cancelAnimationFrame(frame); };
  }, [trigger, gl, scene, camera, onCapture, onError]);
  return null;
}
