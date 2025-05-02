import { useState, useRef } from "react";
import { Link } from "@remix-run/react";
import Header from "~/components/header";

// Define the expected structure for avatar creation arguments
export interface CreateUserAvatarArgs {
  username: number[];
  description: number[];
  avatar2d: number[];
  avatar3d: string[]; // IPFS hashes
}

// Mock list of free-to-use 3D avatars with IPFS references
const avatarList = [
  { imgHash: "QmbCrNSEck2ZMGxoVJBMcsxF6fdiaGxCiSykxD8HLCKxbF", modelHash: "QmbCrNSEck2ZMGxoVJBMcsxF6fdiaGxCiSykxD8HLCKxbF", avatarMint: "avatarMint100" },
  { imgHash: "QmaX4sAJV5p9a7dvxB67xY6CAJotX82B7FixYmhzgwTfEz", modelHash: "QmaX4sAJV5p9a7dvxB67xY6CAJotX82B7FixYmhzgwTfEz", avatarMint: "avatarMint101" },
  { imgHash: "QmekQoqgmxsCY3asmFVbSH8yKRS9C8vmMMhNFWPC1JEF2z", modelHash: "QmekQoqgmxsCY3asmFVbSH8yKRS9C8vmMMhNFWPC1JEF2z", avatarMint: "avatarMint102" },
  { imgHash: "QmbCrNSEck2ZMGxoVJBMcsxF6fdiaGxCiSykxD8HLCKxbF", modelHash: "QmbCrNSEck2ZMGxoVJBMcsxF6fdiaGxCiSykxD8HLCKxbF", avatarMint: "avatarMint103" },
  { imgHash: "QmaX4sAJV5p9a7dvxB67xY6CAJotX82B7FixYmhzgwTfEz", modelHash: "QmaX4sAJV5p9a7dvxB67xY6CAJotX82B7FixYmhzgwTfEz", avatarMint: "avatarMint104" },
  { imgHash: "QmekQoqgmxsCY3asmFVbSH8yKRS9C8vmMMhNFWPC1JEF2z", modelHash: "QmekQoqgmxsCY3asmFVbSH8yKRS9C8vmMMhNFWPC1JEF2z", avatarMint: "avatarMint105" },
  { imgHash: "QmbCrNSEck2ZMGxoVJBMcsxF6fdiaGxCiSykxD8HLCKxbF", modelHash: "QmbCrNSEck2ZMGxoVJBMcsxF6fdiaGxCiSykxD8HLCKxbF", avatarMint: "avatarMint106" },
  { imgHash: "QmaX4sAJV5p9a7dvxB67xY6CAJotX82B7FixYmhzgwTfEz", modelHash: "QmaX4sAJV5p9a7dvxB67xY6CAJotX82B7FixYmhzgwTfEz", avatarMint: "avatarMint107" },
  { imgHash: "QmekQoqgmxsCY3asmFVbSH8yKRS9C8vmMMhNFWPC1JEF2z", modelHash: "QmekQoqgmxsCY3asmFVbSH8yKRS9C8vmMMhNFWPC1JEF2z", avatarMint: "avatarMint108" },
  { imgHash: "QmbCrNSEck2ZMGxoVJBMcsxF6fdiaGxCiSykxD8HLCKxbF", modelHash: "QmbCrNSEck2ZMGxoVJBMcsxF6fdiaGxCiSykxD8HLCKxbF", avatarMint: "avatarMint109" },
  { imgHash: "QmaX4sAJV5p9a7dvxB67xY6CAJotX82B7FixYmhzgwTfEz", modelHash: "QmaX4sAJV5p9a7dvxB67xY6CAJotX82B7FixYmhzgwTfEz", avatarMint: "avatarMint110" },
  { imgHash: "QmekQoqgmxsCY3asmFVbSH8yKRS9C8vmMMhNFWPC1JEF2z", modelHash: "QmekQoqgmxsCY3asmFVbSH8yKRS9C8vmMMhNFWPC1JEF2z", avatarMint: "avatarMint111" },
  { imgHash: "QmbCrNSEck2ZMGxoVJBMcsxF6fdiaGxCiSykxD8HLCKxbF", modelHash: "QmbCrNSEck2ZMGxoVJBMcsxF6fdiaGxCiSykxD8HLCKxbF", avatarMint: "avatarMint112" },
  { imgHash: "QmaX4sAJV5p9a7dvxB67xY6CAJotX82B7FixYmhzgwTfEz", modelHash: "QmaX4sAJV5p9a7dvxB67xY6CAJotX82B7FixYmhzgwTfEz", avatarMint: "avatarMint113" },
  { imgHash: "QmekQoqgmxsCY3asmFVbSH8yKRS9C8vmMMhNFWPC1JEF2z", modelHash: "QmekQoqgmxsCY3asmFVbSH8yKRS9C8vmMMhNFWPC1JEF2z", avatarMint: "avatarMint114" },
];

export default function AvatarEditor() {
  // Wallet connection state
  const [connected, setConnected] = useState(false);
  const [address, setAddress] = useState("");

  // Ref for horizontal scroll container
  const containerRef = useRef<HTMLDivElement>(null);

  const nicknamePlaceholders = [
    "Wotori", "NeonNinja", "CyberFrog", "PixelMage", "QuantumLlama", "CodeSamurai", "Zero404"
  ];

  const descriptionPlaceholders = [
    "Time traveler with a broken compass.",
    "Debugging reality one frame at a time.",
    "Born in the cloud, raised on open source.",
    "Can compile thoughts in under 2 seconds.",
    "Likes long walks on the blockchain.",
    "Rendered in dreams and TypeScript.",
    "Here for the tacos and async magic."
  ];

  // Form inputs
  const [usernameInput, setUsernameInput] = useState(() =>
    nicknamePlaceholders[Math.floor(Math.random() * nicknamePlaceholders.length)]
  );
  const [descriptionInput, setDescriptionInput] = useState(() =>
    descriptionPlaceholders[Math.floor(Math.random() * descriptionPlaceholders.length)]
  );
  const [avatar2dInput, setAvatar2dInput] = useState("");

  // Selected 3D avatar object
  const [selectedAvatar, setSelectedAvatar] = useState(avatarList[0]);

  // Mock wallet connect
  const handleConnect = () => {
    const mockAddress = "0xAbCd...1234";
    setAddress(mockAddress);
    setConnected(true);
  };

  // CSV → number[] parser
  const parseNumberArray = (str: string): number[] =>
    str
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => !isNaN(n));

  // Save handler
  const handleSave = () => {
    const args: CreateUserAvatarArgs = {
      username: parseNumberArray(usernameInput),
      description: parseNumberArray(descriptionInput),
      avatar2d: parseNumberArray(avatar2dInput),
      avatar3d: [selectedAvatar.modelHash],
    };
    console.log("Executing transaction with args:", args);
  };

  return (
    <div className="w-full h-screen flex flex-col">
      <Header connected={connected} address={address} onConnect={handleConnect} />
      <div className="flex-1 overflow-auto px-8 py-4 bg-white dark:bg-gray-900 rounded-3xl shadow-xl">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Left: Form Inputs */}
          <div className="space-y-6">
            {/* Username */}
            <div className="flex flex-col">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Username
              </label>
              <input
                type="text"
                value={usernameInput}
                onChange={(e) => setUsernameInput(e.target.value)}
                placeholder=""
                className="bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-4 py-2 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            {/* Description */}
            <div className="flex flex-col">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Description
              </label>
              <input
                type="text"
                value={descriptionInput}
                onChange={(e) => setDescriptionInput(e.target.value)}
                placeholder=""
                className="bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-4 py-2 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            {/* Avatar Mint */}
            <div className="flex flex-col">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Avatar Mint
              </label>
              <input
                type="text"
                value={selectedAvatar.avatarMint}
                readOnly
                className="bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-4 py-2 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            {/* Save Button */}
            <button
              onClick={handleSave}
              disabled={!connected}
              className="w-full mt-4 px-6 py-3 bg-green-500 text-white font-semibold rounded-lg shadow-md hover:bg-green-600 focus:outline-none focus:ring-4 focus:ring-green-300 transition-colors duration-200 disabled:opacity-50"
            >
              Save Profile
            </button>

            {!connected && (
              <p className="text-center text-sm text-red-500 mt-2">
                Please connect your wallet to save your avatar.
              </p>
            )}
          </div>

          {/* Right: Scrollable Avatar Gallery + Selection Details */}
          <div>
            {/* 3D Visualization Placeholder */}
            <div className="mb-6">
              <img
                src={`https://ipfs.io/ipfs/${selectedAvatar.modelHash}`}
                alt={`3D visualization of model ${selectedAvatar.modelHash}`}
                className="w-full h-80 object-contain rounded-lg shadow-lg"
              />
            </div>
            <h3 className="text-lg font-medium text-gray-800 dark:text-gray-200 mb-4">
              Browse &amp; Select 3D Avatars
            </h3>
            <div ref={containerRef} className="h-40 overflow-x-auto whitespace-nowrap flex gap-4 p-1">
              {avatarList.map((avatar) => (
                <div
                  key={avatar.imgHash}
                  className="p-1 inline-block"
                  ref={el => {
                    if (avatar.avatarMint === selectedAvatar.avatarMint && el) {
                      el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
                    }
                  }}
                >
                  <div
                    className={`relative w-32 h-32 overflow-hidden rounded-lg shadow-sm hover:shadow-md transition-shadow duration-150 cursor-pointer ${avatar.avatarMint === selectedAvatar.avatarMint ? 'ring-4 ring-purple-500' : 'ring-0'}`}
                    onClick={() => setSelectedAvatar(avatar)}
                  >
                    <img
                      src={`https://ipfs.io/ipfs/${avatar.imgHash}`}
                      alt={avatar.imgHash}
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Selected Avatar IPFS Details */}
            <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <p className="text-sm text-gray-700 dark:text-gray-300">
                <strong>Image IPFS Hash:</strong> {selectedAvatar.imgHash}
              </p>
              <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">
                <strong>Model IPFS Hash:</strong> {selectedAvatar.modelHash}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
