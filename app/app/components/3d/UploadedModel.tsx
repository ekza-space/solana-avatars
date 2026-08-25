import { useCallback } from "react";
import { AvatarModel } from "@ekza/avatar-renderer/model";
import { validAnimationsNames } from "./animations";

const PREVIEW_AVATAR_HEIGHT = 4;

interface Properties {
  file: string;
  scale: [number, number, number];
  position: [number, number, number];
  setAnimations: React.Dispatch<React.SetStateAction<string[]>>;
  playAnimation: string;
}

export default function UploadedModel(props: Properties) {
  const { file, scale, position, setAnimations, playAnimation } = props;

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
    },
    [setAnimations]
  );

  return (
    <group scale={scale} position={position} dispose={null}>
      <AvatarModel
        url={file}
        targetHeight={PREVIEW_AVATAR_HEIGHT}
        animation={playAnimation || undefined}
        onAnimationsChange={handleAnimationsChange}
      />
    </group>
  );
}
