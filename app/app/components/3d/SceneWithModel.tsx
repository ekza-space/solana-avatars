import {
  Component,
  Suspense,
  useEffect,
  useState,
  type ErrorInfo,
  type ReactNode,
} from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";

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
        className="webGL relative border border-black flex-grow"
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
              <hemisphereLight args={[0xeeeeff, 0x444444, 0.6]} />
              <directionalLight position={[5, 10, 7]} intensity={1} />
              <pointLight position={[-10, 15, 10]} intensity={0.8} />
            </Canvas>
          </ModelErrorBoundary>
        )}
      </div>
    </div>
  );
}
