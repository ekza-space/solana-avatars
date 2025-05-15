import { useThree } from "@react-three/fiber";
import { useEffect } from "react";
import * as THREE from "three";
import { saveBlobToLocalStorage } from "~/utils/saveBlob";

export default function ScreenShot({ ...props }) {
  const { gl, scene, camera } = useThree();

  useEffect(() => {
    console.log("screenshot effect");
    storeScreenShot();
  }, [props.trigger]);

  function storeScreenShot() {
    console.log(gl);
    gl.render(scene, camera);
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 0.6;
    gl.domElement.toBlob(
      function (blob) {
        if (blob) {
          saveBlobToLocalStorage(blob, "previewIPFS");
          console.log("Screenshot saved to local storage.");
        } else {
          console.warn("Screenshot blob is null.");
        }
      },
      "image/png",
      1.0
    );
  }
  return null;
}
