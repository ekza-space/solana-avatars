export const animationModel = {
  action: [
    "tpose",
    "idle",
    "walk",
    "run",
    "jump",
    "attack",
    "death",
    "hit",
    "stagger",
    "crouch",
    "fly",
    "climb",
    "swim",
  ],
  communication: ["dance", "wave", "emote", "celebrate"],
};

export const validAnimationsNames = [
  ...animationModel.action,
  ...animationModel.communication,
];
