import { useState, useEffect } from "react";
import {
  useAnchorWallet,
  useConnection,
  useWallet,
} from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";

import { decodeByteArray, encodeString } from "~/utils/bytes";
import AvatarSelector, { avatarList } from "~/components/AvatarSelector";
import {
  Button,
  Card,
  DataList,
  Field,
  Input,
  Meta,
  Notice,
  Page,
  PageHeader,
  Status,
  Textarea,
} from "~/components/ui";
import { useSolanaNetwork } from "~/lib/network";


// Define the expected structure for avatar creation arguments
export interface CreateUserAvatarArgs {
  username: number[];
  description: number[];
  avatar2d: number[];
  avatar3d: string[]; // IPFS hashes
};

// The original on-chain profile remains available in the optional Web3 area.
export default function AvatarEditor() {
  const { connected } = useWallet();
  const anchorWallet = useAnchorWallet();
  const { connection } = useConnection();
  const { clusterLabel } = useSolanaNetwork();
  // Prevent SSR/client markup mismatch
  const [isClient, setIsClient] = useState(false);
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Track existing profile on-chain
  const [profileExists, setProfileExists] = useState<boolean>(false);
  const [profilePda, setProfilePda] = useState<PublicKey | null>(null);
  const [currentAvatarMint, setCurrentAvatarMint] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<
    { tone: "success" | "error"; text: string } | null
  >(null);

  // On wallet connect, try loading the profile PDA to decide create vs update
  useEffect(() => {
    if (!connected || !anchorWallet) return;
    (async () => {
      try {
        const [anchor, { default: sdk }] = await Promise.all([
          import("@coral-xyz/anchor"),
          import("avatars-sdk/profile"),
        ]);
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
        setCurrentAvatarMint(mintKey);
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
        setCurrentAvatarMint(null);
      }
    })();
  }, [connected, anchorWallet, connection]);

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
      setNotice({ tone: "error", text: "Connect a wallet first." });
      return;
    }
    setNotice(null);
    setSaving(true);
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
    const provider = new anchor.AnchorProvider(connection, anchorWallet, anchor.AnchorProvider.defaultOptions());
    const program = new anchor.Program(sdk.idlJson as any, provider) as any;
    const avatars = sdk.create(provider, program as any);

    try {
      if (profileExists && profilePda) {
        const selectedAvatarMint = selectedAvatar.avatarMint.toString();
        await avatars.updateProfile({
          username: args.username,
          description: args.description,
          avatarMint: selectedAvatarMint !== currentAvatarMint
            ? new PublicKey(selectedAvatar.avatarMint)
            : null,
        });
        console.log("Profile updated successfully");
        setNotice({ tone: "success", text: "Profile updated." });
        setCurrentAvatarMint(selectedAvatarMint);
      } else {
        await avatars.initializeProfile({
          username: args.username,
          description: args.description,
          avatarMint: new PublicKey(selectedAvatar.avatarMint),
        });
        console.log("Profile initialized successfully");
        setProfileExists(true);
        setNotice({ tone: "success", text: "Profile created." });
        setCurrentAvatarMint(selectedAvatar.avatarMint.toString());
      }
    } catch (error) {
      console.error("Failed to save profile", error);
      setNotice({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Failed to save the profile.",
      });
    } finally {
      setSaving(false);
    }
  };

  // Delete handler
  const handleDelete = async () => {
    if (!anchorWallet) {
      console.error("Wallet not connected");
      return;
    }
    if (!profilePda) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm("Delete the profile account on-chain? This cannot be undone.")
    ) {
      return;
    }
    setNotice(null);
    setSaving(true);
    // Initialize provider and SDK
    const [anchor, { default: sdk }] = await Promise.all([
      import("@coral-xyz/anchor"),
      import("avatars-sdk/profile"),
    ]);
    const provider = new anchor.AnchorProvider(connection, anchorWallet, anchor.AnchorProvider.defaultOptions());
    const program = new anchor.Program(sdk.idlJson as any, provider) as any;
    const avatars = sdk.create(provider, program as any);
    try {
      await avatars.deleteProfile();
      console.log("Profile deleted successfully");
      setNotice({ tone: "success", text: "Profile deleted." });
      setProfileExists(false);
      setCurrentAvatarMint(null);
      // Optionally reset form
      setUsernameInput("");
      setDescriptionInput("");
      setSelectedAvatar(avatarList[0]);
    } catch (error) {
      console.error("Failed to delete profile", error);
      setNotice({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Failed to delete the profile.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Page>
      <PageHeader
        eyebrow="Profile"
        title={
          <>
            Your on-chain
            <br />
            identity.
          </>
        }
        lede="A username, a short bio and one avatar NFT — stored in a profile account you own and can delete at any time."
        meta={
          <>
            <Meta label="Network" value={clusterLabel} />
            <Meta label="Mode" value={profileExists ? "Update" : "Create"} />
            <Status tone={connected ? "ok" : "error"}>
              {connected ? "Wallet connected" : "Wallet disconnected"}
            </Status>
          </>
        }
      />

      {notice ? (
        <Notice tone={notice.tone} className="mt-8">
          {notice.text}
        </Notice>
      ) : null}

      <div className="mt-8 grid gap-8 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card className="p-5 sm:p-6">
            <h2 className="ui-h3">Identity</h2>
            <div className="mt-5 grid gap-5">
              <Field
                label="Username"
                hint="Public handle stored in the profile account."
              >
                <Input
                  type="text"
                  value={usernameInput}
                  onChange={(e) => setUsernameInput(e.target.value)}
                  placeholder={suggestedUsername}
                  autoComplete="nickname"
                />
              </Field>

              <Field label="Bio" hint="One or two lines. Shown next to your avatar.">
                <Textarea
                  value={descriptionInput}
                  onChange={(e) => setDescriptionInput(e.target.value)}
                  placeholder={suggestedDescription}
                  rows={4}
                />
              </Field>
            </div>

            <div className="mt-6 border-t border-[rgb(var(--line))] pt-4">
              <DataList
                items={[
                  {
                    label: "Avatar mint",
                    value: selectedAvatar.avatarMint.toString(),
                  },
                  profilePda
                    ? { label: "Profile PDA", value: profilePda.toBase58() }
                    : null,
                ]}
              />
              <p className="ui-copy-sm mt-3">
                Pick the avatar on the right — the mint address follows your
                selection.
              </p>
            </div>

            <details className="mt-5 border-t border-[rgb(var(--line))] pt-4">
              <summary className="ui-label cursor-pointer select-none">
                Advanced · legacy 2D data
              </summary>
              <div className="mt-4">
                <Field
                  label="Avatar 2D bytes"
                  optional
                  hint="CSV byte array kept for backwards compatibility. Leave empty unless you know you need it."
                >
                  <Input
                    type="text"
                    value={avatar2dInput}
                    onChange={(e) => setAvatar2dInput(e.target.value)}
                    placeholder="12, 34, 56"
                  />
                </Field>
              </div>
            </details>

            <div className="mt-6">
              <Button
                onClick={handleSave}
                disabled={!connected || saving}
                className="w-full"
              >
                {saving
                  ? "Signing…"
                  : profileExists
                    ? "Update profile"
                    : "Create profile"}
              </Button>
              {!connected ? (
                <p className="mt-3 text-sm font-medium text-[rgb(var(--danger))]">
                  Connect a wallet to save your profile.
                </p>
              ) : null}
            </div>
          </Card>

          {profileExists ? (
            <div className="border border-[rgba(var(--danger),0.4)] p-5">
              <h2 className="ui-h3">Delete profile</h2>
              <p className="ui-copy-sm mt-2">
                Closes the profile account on-chain. Your avatar NFT stays in
                the wallet.
              </p>
              <Button
                variant="danger"
                className="mt-4"
                disabled={!connected || saving}
                onClick={handleDelete}
              >
                Delete profile
              </Button>
            </div>
          ) : null}
        </div>

        <AvatarSelector
          avatarList={avatarList}
          selectedAvatar={selectedAvatar}
          setSelectedAvatar={setSelectedAvatar}
        />
      </div>
    </Page>
  );
}
