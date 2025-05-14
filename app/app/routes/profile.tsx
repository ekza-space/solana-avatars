import { useState, useRef, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import Header from "~/components/header";
import { Connection, PublicKey, clusterApiUrl } from "@solana/web3.js";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { decodeByteArray, encodeString } from "~/utils/bytes";


import sdk from "../../../sdk/src";
import type { UserProfile } from "../../../sdk/src";
import AvatarSelector, { avatarList } from "~/components/AvatarSelector";


// Define the expected structure for avatar creation arguments
export interface CreateUserAvatarArgs {
  username: number[];
  description: number[];
  avatar2d: number[];
  avatar3d: string[]; // IPFS hashes
};

export default function AvatarEditor() {

  // Burn invalid NFTs handler
  const { publicKey, connected, sendTransaction } = useWallet();
  // Prevent SSR/client markup mismatch
  const [isClient, setIsClient] = useState(false);
  useEffect(() => {
    setIsClient(true);
  }, []);

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

    program.account.userProfile.fetch(pda)
      .then((account: any) => {
        setProfileExists(true);
        setUsernameInput(decodeByteArray(account.username));
        setDescriptionInput(decodeByteArray(account.description));

        // Try to find avatar by mint, or create fallback
        const mintKey = account.avatarMint.toString();
        let match = avatarList.find(a => a.avatarMint.toString() === mintKey);
        if (!match) {
          // fallback for unknown avatar mints
          match = {
            avatarMint: new PublicKey(mintKey),
            imgHash: "",
            modelHash: "",
          };
        }
        setSelectedAvatar(match);
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
              <>
                <button
                  onClick={handleDelete}
                  disabled={!connected}
                  className="w-full mt-2 px-6 py-3 bg-red-500 text-white font-semibold rounded-lg shadow-md hover:bg-red-600 focus:outline-none focus:ring-4 focus:ring-red-300 transition-colors duration-200 disabled:opacity-50"
                >
                  Delete Profile
                </button>
              </>
            )}

            {!connected && (
              <p className="text-center text-sm text-red-500 mt-2">
                Please connect your wallet to save your avatar.
              </p>
            )}
          </div>

          {/* Right: AvatarSelector Component */}
          <AvatarSelector
            avatarList={avatarList}
            selectedAvatar={selectedAvatar}
            setSelectedAvatar={setSelectedAvatar}
          />
        </div>
      </div>
    </div>
  );
}
