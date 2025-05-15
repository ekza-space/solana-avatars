import { useFrame, useThree } from "@react-three/fiber";

export default function CameraCheck() {
  // was used to check camera parametrs on change for copy paste ans setup default position
  const { camera } = useThree();
  useFrame(() => {
    // console.log("camera check...", camera);
  });
  console.log("camera check logic");
  return null;
}
