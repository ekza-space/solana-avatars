import {
  Component,
  Suspense,
  useCallback,
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
  onScreenshot?: (blob: Blob) => void;
  onPreviewError?: (message: string) => void;
}) {
  const { file, screenshot = false, onScreenshot, onPreviewError } = props;
  const [trigger, setTrigger] = useState(0);
  const [animations, setAnimations] = useState<string[]>([]);
  const [playAnimation, setPlayAnimation] = useState("");
  const [modelError, setModelError] = useState("");
  const [readyFile, setReadyFile] = useState("");
  const onReady = useCallback(() => {
    setReadyFile(file);
    setTrigger((value) => value + 1);
  }, [file]);

  useEffect(() => {
    setAnimations([]);
    setPlayAnimation("");
    setModelError("");
  }, [file]);

  return (
    <div className="flex flex-col w-full h-full">
      {!modelError && animations.length > 0 ? (
        // Segmented control: the previous version was a row of blue links with
        // no selected state, so you could not tell which clip was playing.
        // "tpose" is the model's rest pose, i.e. the stop button.
        <div
          role="group"
          aria-label="Animation"
          className="mb-3 flex flex-wrap items-center justify-center gap-px self-center border border-[rgb(var(--line))] bg-[rgb(var(--line))]"
        >
          {animations.map((animationName) => {
            const isActive =
              animationName === (playAnimation || animations[0]);
            const label = animationName === "tpose" ? "rest" : animationName;
            return (
              <button
                key={animationName}
                type="button"
                aria-pressed={isActive}
                onClick={() => setPlayAnimation(animationName)}
                className={`px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] transition-colors ${
                  isActive
                    ? "bg-[rgb(var(--accent))] text-[rgb(var(--accent-ink))]"
                    : "bg-[rgb(var(--surface))] text-[rgb(var(--text))] hover:bg-[rgb(var(--surface-2))] hover:text-[rgb(var(--text-strong))]"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      ) : null}
      <div
        className="webGL relative flex-grow overflow-hidden border border-[rgb(var(--line))] bg-[rgb(var(--surface-2))]"
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
            onError={(message) => {
              const description = `Failed to load 3D model. ${message}`;
              setModelError(description);
              onPreviewError?.(description);
            }}
          >
            <Canvas
              style={{
                width: "100%",
                height: "100%",
                backgroundColor: "rgb(var(--surface-2))",
              }}
              camera={{
                position: [0, 0, 5],
                fov: 35,
                near: 0.01,
                far: 1000,
              }}
              dpr={[1, 2]}
              gl={{ antialias: true, alpha: true }}
            >
              <OrbitControls makeDefault enablePan={false} />
              <Suspense fallback={<Loader />}>
                <UploadedModel
                  key={file}
                  file={file}
                  scale={[1, 1, 1]}
                  position={[0, 0, 0]}
                  setAnimations={setAnimations}
                  playAnimation={playAnimation}
                  onReady={onReady}
                />
                {screenshot && readyFile === file && <ScreenShot key={file} trigger={trigger} onCapture={onScreenshot} onError={onPreviewError} />}
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
