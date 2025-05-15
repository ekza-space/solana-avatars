import { Html, useProgress } from "@react-three/drei";

export default function Loader() {
  const { progress } = useProgress();
  return progress !== 100 ? <Html center>{progress} % loaded</Html> : null;
}
