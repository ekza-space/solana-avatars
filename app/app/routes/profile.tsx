import { useState, useRef, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import Header from "~/components/header";
import { Connection, Keypair, PublicKey, clusterApiUrl } from "@solana/web3.js";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { decodeByteArray, encodeString } from "~/utils/bytes";

import sdk from "../../../sdk/src";
import type { UserProfile } from "../../../sdk/src";


// Define the expected structure for avatar creation arguments
export interface CreateUserAvatarArgs {
  username: number[];
  description: number[];
  avatar2d: number[];
  avatar3d: string[]; // IPFS hashes
}

// Mock list of free-to-use 3D avatars with IPFS references
const avatarList = [
  { imgHash: "QmbCrNSEck2ZMGxoVJBMcsxF6fdiaGxCiSykxD8HLCKxbF", modelHash: "QmbCrNSEck2ZMGxoVJBMcsxF6fdiaGxCiSykxD8HLCKxbF", avatarMint: new Keypair().publicKey },
  { imgHash: "QmaX4sAJV5p9a7dvxB67xY6CAJotX82B7FixYmhzgwTfEz", modelHash: "QmaX4sAJV5p9a7dvxB67xY6CAJotX82B7FixYmhzgwTfEz", avatarMint: new Keypair().publicKey },
  { imgHash: "QmekQoqgmxsCY3asmFVbSH8yKRS9C8vmMMhNFWPC1JEF2z", modelHash: "QmekQoqgmxsCY3asmFVbSH8yKRS9C8vmMMhNFWPC1JEF2z", avatarMint: new Keypair().publicKey },
  { imgHash: "QmbCrNSEck2ZMGxoVJBMcsxF6fdiaGxCiSykxD8HLCKxbF", modelHash: "QmbCrNSEck2ZMGxoVJBMcsxF6fdiaGxCiSykxD8HLCKxbF", avatarMint: new Keypair().publicKey },
  { imgHash: "QmaX4sAJV5p9a7dvxB67xY6CAJotX82B7FixYmhzgwTfEz", modelHash: "QmaX4sAJV5p9a7dvxB67xY6CAJotX82B7FixYmhzgwTfEz", avatarMint: new Keypair().publicKey },
  { imgHash: "QmekQoqgmxsCY3asmFVbSH8yKRS9C8vmMMhNFWPC1JEF2z", modelHash: "QmekQoqgmxsCY3asmFVbSH8yKRS9C8vmMMhNFWPC1JEF2z", avatarMint: new Keypair().publicKey },
  { imgHash: "QmbCrNSEck2ZMGxoVJBMcsxF6fdiaGxCiSykxD8HLCKxbF", modelHash: "QmbCrNSEck2ZMGxoVJBMcsxF6fdiaGxCiSykxD8HLCKxbF", avatarMint: new Keypair().publicKey },
  { imgHash: "QmaX4sAJV5p9a7dvxB67xY6CAJotX82B7FixYmhzgwTfEz", modelHash: "QmaX4sAJV5p9a7dvxB67xY6CAJotX82B7FixYmhzgwTfEz", avatarMint: new Keypair().publicKey },
  { imgHash: "QmekQoqgmxsCY3asmFVbSH8yKRS9C8vmMMhNFWPC1JEF2z", modelHash: "QmekQoqgmxsCY3asmFVbSH8yKRS9C8vmMMhNFWPC1JEF2z", avatarMint: new Keypair().publicKey },
  { imgHash: "QmbCrNSEck2ZMGxoVJBMcsxF6fdiaGxCiSykxD8HLCKxbF", modelHash: "QmbCrNSEck2ZMGxoVJBMcsxF6fdiaGxCiSykxD8HLCKxbF", avatarMint: new Keypair().publicKey },
  { imgHash: "QmaX4sAJV5p9a7dvxB67xY6CAJotX82B7FixYmhzgwTfEz", modelHash: "QmaX4sAJV5p9a7dvxB67xY6CAJotX82B7FixYmhzgwTfEz", avatarMint: new Keypair().publicKey },
  { imgHash: "QmekQoqgmxsCY3asmFVbSH8yKRS9C8vmMMhNFWPC1JEF2z", modelHash: "QmekQoqgmxsCY3asmFVbSH8yKRS9C8vmMMhNFWPC1JEF2z", avatarMint: new Keypair().publicKey },
  { imgHash: "QmbCrNSEck2ZMGxoVJBMcsxF6fdiaGxCiSykxD8HLCKxbF", modelHash: "QmbCrNSEck2ZMGxoVJBMcsxF6fdiaGxCiSykxD8HLCKxbF", avatarMint: new Keypair().publicKey },
  { imgHash: "QmaX4sAJV5p9a7dvxB67xY6CAJotX82B7FixYmhzgwTfEz", modelHash: "QmaX4sAJV5p9a7dvxB67xY6CAJotX82B7FixYmhzgwTfEz", avatarMint: new Keypair().publicKey },
  { imgHash: "QmekQoqgmxsCY3asmFVbSH8yKRS9C8vmMMhNFWPC1JEF2z", modelHash: "QmekQoqgmxsCY3asmFVbSH8yKRS9C8vmMMhNFWPC1JEF2z", avatarMint: new Keypair().publicKey },
];

export default function AvatarEditor() {
  // Prevent SSR/client markup mismatch
  const [isClient, setIsClient] = useState(false);
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Ref for horizontal scroll container
  const containerRef = useRef<HTMLDivElement>(null);

  // Use Solana Wallet Adapter for connection status
  const { publicKey, connected } = useWallet();

  // Track existing profile on-chain
  const [profileExists, setProfileExists] = useState<boolean>(false);
  const [profilePda, setProfilePda] = useState<PublicKey | null>(null);

  // On wallet connect, try loading the profile PDA to decide create vs update
  useEffect(() => {
    if (!connected) return;
    const connection = new Connection(clusterApiUrl("devnet"));
    const provider = new AnchorProvider(connection, (window as any).solana, AnchorProvider.defaultOptions());
    const program = new Program<UserProfile>(sdk.idlJson as UserProfile, provider);

    const avatars = sdk.create(provider, program);
    const [pda] = avatars.getProfilePda();
    setProfilePda(pda);
    // Attempt to fetch the account
    program.account.userProfile.fetch(pda)
      .then((account: any) => {
        setProfileExists(true);
        // Pre‑fill form fields using the helper to strip trailing null data
        setUsernameInput(decodeByteArray(account.username));
        setDescriptionInput(decodeByteArray(account.description));
        // Select matching avatar if present
        const mintKey = account.avatarMint.toString();
        const match = avatarList.find(a => a.avatarMint.toString() === mintKey);
        if (match) setSelectedAvatar(match);
      })
      .catch(() => {
        setProfileExists(false);
      });
  }, [connected]);

  const nicknamePlaceholders = [
    "NeonNinja", "CyberFrog", "PixelMage", "QuantumLlama", "CodeSamurai", "Zero404"
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
  const [usernameInput, setUsernameInput] = useState("");
  const [descriptionInput, setDescriptionInput] = useState("");

  // Suggested placeholder text
  const [suggestedUsername, setSuggestedUsername] = useState("");
  const [suggestedDescription, setSuggestedDescription] = useState("");

  useEffect(() => {
    if (isClient) {
      setSuggestedUsername(
        nicknamePlaceholders[
        Math.floor(Math.random() * nicknamePlaceholders.length)
        ]
      );
      setSuggestedDescription(
        descriptionPlaceholders[
        Math.floor(Math.random() * descriptionPlaceholders.length)
        ]
      );
    }
  }, [isClient]);

  const [avatar2dInput, setAvatar2dInput] = useState("");

  // Selected 3D avatar object
  const [selectedAvatar, setSelectedAvatar] = useState(avatarList[0]);

  // CSV → number[] parser
  const parseNumberArray = (str: string): number[] =>
    str
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => !isNaN(n));

  // Save handler
  const handleSave = async () => {
    // Encode form inputs using the same symmetric helper
    const args: CreateUserAvatarArgs = {
      username: encodeString(usernameInput),
      description: encodeString(descriptionInput),
      avatar2d: parseNumberArray(avatar2dInput),
      avatar3d: [selectedAvatar.modelHash],
    };
    // Initialize Anchor provider and SDK
    const connection = new Connection(clusterApiUrl("devnet"));
    const provider = new AnchorProvider(connection, (window as any).solana, AnchorProvider.defaultOptions());
    const program = new Program<UserProfile>(sdk.idlJson as UserProfile, provider);
    const avatars = sdk.create(provider, program);

    try {
      if (profileExists && profilePda) {
        await avatars.updateProfile({
          username: args.username,
          description: args.description,
          avatarMint: new PublicKey(selectedAvatar.avatarMint),
        });
        console.log("Profile updated successfully");
        window.alert("Profile updated successfully");
      } else {
        await avatars.initializeProfile({
          username: args.username,
          description: args.description,
          avatarMint: new PublicKey(selectedAvatar.avatarMint),
        });
        console.log("Profile initialized successfully");
        window.alert("Profile initialized successfully");
      }
    } catch (error) {
      console.error("Failed to save profile", error);
    }
  };

  // Delete handler
  const handleDelete = async () => {
    if (!profilePda) return;
    // Initialize provider and SDK
    const connection = new Connection(clusterApiUrl("devnet"));
    const provider = new AnchorProvider(connection, (window as any).solana, AnchorProvider.defaultOptions());
    const program = new Program<UserProfile>(sdk.idlJson as UserProfile, provider);
    const avatars = sdk.create(provider, program);
    try {
      await avatars.deleteProfile();
      console.log("Profile deleted successfully");
      window.alert("Profile deleted successfully");
      setProfileExists(false);
      // Optionally reset form
      setUsernameInput("");
      setDescriptionInput("");
      setSelectedAvatar(avatarList[0]);
    } catch (error) {
      console.error("Failed to delete profile", error);
    }
  };

  return (
    <div className="w-full h-screen flex flex-col">
      <Header />
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
                placeholder={suggestedUsername}
                className="bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-4 py-2 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
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
                placeholder={suggestedDescription}
                className="bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-4 py-2 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            {/* Avatar Mint */}
            <div className="flex flex-col">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Avatar Mint
              </label>
              <input
                type="text"
                value={selectedAvatar.avatarMint.toString()}
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
              {profileExists ? "Update Profile" : "Save Profile"}
            </button>
            {profileExists && (
              <button
                onClick={handleDelete}
                disabled={!connected}
                className="w-full mt-2 px-6 py-3 bg-red-500 text-white font-semibold rounded-lg shadow-md hover:bg-red-600 focus:outline-none focus:ring-4 focus:ring-red-300 transition-colors duration-200 disabled:opacity-50"
              >
                Delete Profile
              </button>
            )}

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
                  key={avatar.avatarMint.toString()}
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
