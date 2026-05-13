import {
  Component,
  Suspense,
  useEffect,
  useState,
  type ErrorInfo,
  type ReactNode,
} from "react";
import { Canvas } from "@react-three/fiber";
import { Center, OrbitControls } from "@react-three/drei";

import ScreenShot from "./ScreenShot";
import Loader from "./loader";
import UploadedModel from "./UploadedModel";

type ModelErrorBoundaryProps = {
  children: ReactNode;
  onError: (message: string) => void;
};

type ModelErrorBoundaryState = {
  hasError: boolean;
};

class ModelErrorBoundary extends Component<
  ModelErrorBoundaryProps,
  ModelErrorBoundaryState
> {
  state: ModelErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, _errorInfo: ErrorInfo) {
    console.error("3D model render failed:", error);
    this.props.onError(
      error.message || "Unable to load this 3D model."
    );
  }

  render() {
    if (this.state.hasError) {
      return null;
    }

    return this.props.children;
  }
}

function ModelErrorFallback({ message }: { message: string }) {
  return (
    <div className="flex h-full min-h-[240px] items-center justify-center rounded border border-red-200 bg-red-50 px-4 text-center text-sm text-red-700">
      {message}
    </div>
  );
}

export default function SceneWithModel(props: {
  file: string;
  screenshot?: boolean;
}) {
  const { file, screenshot = false } = props;
  const [trigger, setTrigger] = useState(0);
  const [animations, setAnimations] = useState<string[]>([]);
  const [playAnimation, setPlayAnimation] = useState("");
  const [modelError, setModelError] = useState("");

  useEffect(() => {
    setAnimations([]);
    setPlayAnimation("");
    setModelError("");
  }, [file]);

  return (
    <div className="flex flex-col w-full h-full">
      {!modelError && (
        <div className="flex flex-row justify-center space-x-4 pb-2">
        {animations &&
          animations.map((animationName) => (
            <p
              key={animationName}
              className="cursor-pointer text-blue-600 hover:underline select-none"
              onClick={(e) => {
                const selectedAnimation = e.currentTarget.textContent;
                console.log(selectedAnimation);
                if (selectedAnimation !== null) {
                  setPlayAnimation(selectedAnimation);
                }
              }}
            >
              {animationName}
            </p>
          ))}
        </div>
      )}
      <div
        className="webGL relative flex-grow overflow-hidden rounded-[18px] border border-[rgba(var(--line),0.55)] bg-[rgba(var(--surface-2),0.9)]"
        onMouseLeave={() => {
          if (!screenshot) return;
          setTrigger((value) => value + 1);
        }}
      >
        {modelError ? (
          <ModelErrorFallback message={modelError} />
        ) : (
          <ModelErrorBoundary
            key={file}
            onError={(message) =>
              setModelError(
                `Failed to load 3D model. ${message}`
              )
            }
          >
            <Canvas
              style={{
                width: "100%",
                height: "100%",
                backgroundColor: "rgb(var(--surface-2))",
              }}
              camera={{
                position: [0, 4, 5],
                near: 0.1,
                far: 1000,
              }}
              dpr={[1, 2]}
              gl={{ antialias: true, alpha: true }}
            >
              <OrbitControls target={[0, 0, 0]} />
              <Suspense fallback={<Loader />}>
                <Center>
                  <UploadedModel
                    key={file}
                    file={file}
                    scale={[1, 1, 1]}
                    position={[0, 0, 0]}
                    setAnimations={setAnimations}
                    playAnimation={playAnimation}
                  />
                </Center>
                {screenshot && <ScreenShot trigger={trigger} />}
              </Suspense>

              <ambientLight intensity={1.8} />
              <hemisphereLight args={[0xeeeeff, 0x4a4a5a, 0.7]} />
              <directionalLight position={[8, 12, 8]} intensity={1.1} />
              <directionalLight
                position={[-8, 4, -6]}
                intensity={0.45}
                color={0x5f9fff}
              />
              <pointLight position={[-10, 15, 10]} intensity={0.9} />
            </Canvas>
          </ModelErrorBoundary>
        )}
      </div>
    </div>
  );
}
