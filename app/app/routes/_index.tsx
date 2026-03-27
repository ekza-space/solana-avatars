import { useState, useEffect } from "react";
import { useWallet, useAnchorWallet } from "@solana/wallet-adapter-react";
import { Connection, PublicKey, clusterApiUrl } from "@solana/web3.js";

import { decodeByteArray, encodeString } from "~/utils/bytes";
import AvatarSelector, { avatarList } from "~/components/AvatarSelector";
import { Badge, Button, Field, Input, PageSection, Panel, StatCard, Textarea } from "~/components/ui";


// Define the expected structure for avatar creation arguments
export interface CreateUserAvatarArgs {
  username: number[];
  description: number[];
  avatar2d: number[];
  avatar3d: string[]; // IPFS hashes
};

export default function AvatarEditor() {
  const { connected } = useWallet();
  const anchorWallet = useAnchorWallet();
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
    if (!connected || !anchorWallet) return;
    (async () => {
      try {
        const [anchor, { default: sdk }] = await Promise.all([
          import("@coral-xyz/anchor"),
          import("avatars-sdk/profile"),
        ]);
        const connection = new Connection(clusterApiUrl("devnet"));
        const provider = new anchor.AnchorProvider(connection, anchorWallet, anchor.AnchorProvider.defaultOptions());
        const program = new anchor.Program(sdk.idlJson as any, provider) as any;
        const avatars = sdk.create(provider, program as any);
        const [pda] = avatars.getProfilePda();
        setProfilePda(pda);

        const account: any = await program.account.userProfile.fetch(pda);
        setProfileExists(true);
        setUsernameInput(decodeByteArray(account.username));
        setDescriptionInput(decodeByteArray(account.description));

        const mintKey = account.avatarMint.toString();
        let match = avatarList.find(a => a.avatarMint.toString() === mintKey);
        if (!match) {
          match = {
            avatarMint: new PublicKey(mintKey),
            imgHash: "",
            modelHash: "",
          };
        }
        setSelectedAvatar(match);
      } catch (error) {
        console.warn("Failed to load profile PDA:", error);
        setProfileExists(false);
      }
    })();
  }, [connected, anchorWallet]);

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
    if (!connected || !anchorWallet) {
      console.error("Wallet not connected");
      return;
    }
    // Encode form inputs using the same symmetric helper
    const args: CreateUserAvatarArgs = {
      username: encodeString(usernameInput),
      description: encodeString(descriptionInput),
      avatar2d: parseNumberArray(avatar2dInput),
      avatar3d: [selectedAvatar.modelHash],
    };
    // Initialize Anchor provider and SDK
    const [anchor, { default: sdk }] = await Promise.all([
      import("@coral-xyz/anchor"),
      import("avatars-sdk/profile"),
    ]);
    const connection = new Connection(clusterApiUrl("devnet"));
    const provider = new anchor.AnchorProvider(connection, anchorWallet, anchor.AnchorProvider.defaultOptions());
    const program = new anchor.Program(sdk.idlJson as any, provider) as any;
    const avatars = sdk.create(provider, program as any);

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
    if (!anchorWallet) {
      console.error("Wallet not connected");
      return;
    }
    if (!profilePda) return;
    // Initialize provider and SDK
    const [anchor, { default: sdk }] = await Promise.all([
      import("@coral-xyz/anchor"),
      import("avatars-sdk/profile"),
    ]);
    const connection = new Connection(clusterApiUrl("devnet"));
    const provider = new anchor.AnchorProvider(connection, anchorWallet, anchor.AnchorProvider.defaultOptions());
    const program = new anchor.Program(sdk.idlJson as any, provider) as any;
    const avatars = sdk.create(provider, program as any);
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
    <PageSection
      eyebrow="Profile Console"
      title="Build your on-chain identity"
      description="Manage the same Solana avatar profile flow, now organized as a calmer workstation with clear form states and a dedicated asset browser."
      actions={
        <>
          <Badge tone={profileExists ? "success" : "default"}>
            {profileExists ? "Profile found" : "New profile"}
          </Badge>
          <Badge>{connected ? "Wallet connected" : "Wallet disconnected"}</Badge>
        </>
      }
    >
      <div className="mb-6 grid gap-5 lg:grid-cols-3">
        <StatCard label="Network" value="Devnet" hint="Current Solana environment for profile operations." />
        <StatCard label="Mode" value={profileExists ? "Update" : "Create"} hint="Detected automatically from your on-chain PDA." />
        <StatCard label="Selected asset" value={selectedAvatar.avatarMint.toString().slice(0, 8) + "..."} hint="Current NFT bound to the profile form." />
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
        <Panel className="space-y-5">
          <div className="space-y-2">
            <div className="ui-label">Identity Form</div>
            <h2 className="font-display text-2xl font-semibold tracking-tight text-[rgb(var(--text-strong))]">
              Configure your public persona
            </h2>
            <p className="ui-copy">
              The underlying create, update, and delete logic is unchanged. Only the presentation and layout have been upgraded.
            </p>
          </div>

          <div className="grid gap-4">
            <Field label="Username" hint="Short public handle stored in the profile account.">
              <Input
                type="text"
                value={usernameInput}
                onChange={(e) => setUsernameInput(e.target.value)}
                placeholder={suggestedUsername}
              />
            </Field>

            <Field label="Description" hint="Bio or identity blurb shown alongside your avatar.">
              <Textarea
                value={descriptionInput}
                onChange={(e) => setDescriptionInput(e.target.value)}
                placeholder={suggestedDescription}
                rows={4}
              />
            </Field>

            <Field label="Avatar Mint" hint="Chosen automatically from the wallet inventory panel.">
              <Input
                type="text"
                value={selectedAvatar.avatarMint.toString()}
                readOnly
              />
            </Field>

            <Field
              label="Legacy 2D data"
              hint="Kept for compatibility with the current data model."
            >
              <Input
                type="text"
                value={avatar2dInput}
                onChange={(e) => setAvatar2dInput(e.target.value)}
                placeholder="Optional CSV byte array"
              />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Button onClick={handleSave} disabled={!connected} className="w-full">
              {profileExists ? "Update profile" : "Save profile"}
            </Button>
            {profileExists ? (
              <Button
                onClick={handleDelete}
                disabled={!connected}
                variant="danger"
                className="w-full"
              >
                Delete profile
              </Button>
            ) : null}
          </div>

          {!connected ? (
            <p className="text-sm font-medium text-[rgb(var(--danger))]">
              Please connect your wallet to save your avatar profile.
            </p>
          ) : null}
        </Panel>

        <AvatarSelector
          avatarList={avatarList}
          selectedAvatar={selectedAvatar}
          setSelectedAvatar={setSelectedAvatar}
        />
      </div>
    </PageSection>
  );
}
