import { useEffect, useState } from "react";
import { AnimationAction, Group } from "three";
import { useGLTF, useAnimations } from "@react-three/drei";
import { validAnimationsNames } from "./animations";

interface Properties {
  file: string;
  scale: [number, number, number];
  position: [number, number, number];
  setAnimations: React.Dispatch<React.SetStateAction<string[]>>;
  playAnimation: string;
}

export default function UploadedModel(props: Properties) {
  const { file, scale, position, setAnimations, playAnimation } = props;

  const [prevAnim, setPrevAnim] = useState("");
  const model = useGLTF(file);
  const { ref, actions, names } = useAnimations(model.animations) as {
    ref: React.MutableRefObject<Group | null>;
    actions: Record<string, AnimationAction>;
    names: string[];
  };

  model.scene.traverse((object) => {
    if (object.isObject3D) {
      object.castShadow = true;
      object.frustumCulled = false;
    }
  });

  useEffect(() => {
    console.log("actions: ", actions, names);

    let validModelAnimations = names.filter((name) =>
      validAnimationsNames.includes(name)
    );

    if (validModelAnimations.length > 0) {
      validModelAnimations.unshift("tpose");
    }

    setAnimations(validModelAnimations);
    startAnimation();
  }, [file, actions, names]);

  useEffect(() => {
    if (!prevAnim) return;

    if (playAnimation === "tpose") {
      if (prevAnim !== "rpose" && actions[prevAnim]) {
        actions[prevAnim].fadeOut(0.2);
        setPrevAnim(playAnimation);
      }
    } else {
      console.log("change annimation by user");
      if (prevAnim !== "tpose" && actions[prevAnim]) {
        actions[prevAnim].fadeOut(0.2);
      }
      if (actions[playAnimation]) {
        actions[playAnimation].play();
        actions[playAnimation].reset().fadeIn(0.2);
        setPrevAnim(playAnimation);
      }
    }
  }, [playAnimation]);

  function startAnimation(): void {
    if (Object.keys(actions).length && actions["idle"]) {
      actions["idle"].reset().fadeIn(0.5).play();
      setPrevAnim("idle");
    } else {
      console.log("no animations found");
    }
  }

  return (
    <group ref={ref} scale={scale} position={position} dispose={null}>
      <primitive object={model.scene} />
    </group>
  );
}
