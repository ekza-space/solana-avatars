import { Suspense, useEffect, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";

import ScreenShot from "./ScreenShot";
import Loader from "./loader";
import UploadedModel from "./UploadedModel";

export default function SceneWithModel(props: {
  file: string;
  screenshot?: boolean;
}) {
  const { file, screenshot = false } = props;
  const [trigger, setTrigger] = useState(0);
  const [animations, setAnimations] = useState([]);
  const [playAnimation, setPlayAnimation] = useState("");

  return (
    <div className="flex flex-col w-full h-full">
      <div className="flex flex-row justify-center space-x-4 pb-2">
        {animations &&
          animations.map((animationName) => (
            <p
              className="cursor-pointer text-blue-600 hover:underline select-none"
              onClick={(e) => {
                let selectedAnimation = e.currentTarget.textContent;
                console.log(selectedAnimation);
                setPlayAnimation(selectedAnimation);
              }}
            >
              {animationName}
            </p>
          ))}
      </div>
      <div
        className="webGL border border-black flex-grow"
        onMouseLeave={() => {
          console.log("screenshot state: ", screenshot);
          if (!screenshot) return;
          console.log("mouse leave 3D canvas. Updating trigger.");
          setTrigger(trigger + 1);
          return;
        }}
      >
        <Canvas
          camera={{
            position: [0, 4, 5],
            near: 0.1,
            far: 1000,
          }}
        >
          <OrbitControls target={[0, 3, 0]} />
          <Suspense fallback={<Loader />}>
            <UploadedModel
              key={file}
              file={file}
              scale={[1, 1, 1]}
              position={[0, 0, 0]}
              setAnimations={setAnimations}
              playAnimation={playAnimation}
            />
            {screenshot && <ScreenShot trigger={trigger} />}
          </Suspense>

          <ambientLight intensity={2.5} />
          <hemisphereLight skyColor={0xeeeeff} groundColor={0x444444} intensity={0.6} />
          <directionalLight position={[5, 10, 7]} intensity={1} />
          <pointLight position={[-10, 15, 10]} intensity={0.8} />
        </Canvas>
      </div>
    </div>
  );
}
