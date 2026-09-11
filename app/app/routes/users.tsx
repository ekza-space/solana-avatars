import { useEffect, useState } from "react";
import { useConnection } from "@solana/wallet-adapter-react";

import {
  Card,
  DataList,
  EmptyState,
  Meta,
  Page,
  PageHeader,
  Skeleton,
} from "~/components/ui";
import { decodeByteArray } from "~/utils/bytes";
import { useSolanaNetwork } from "~/lib/network";

type Profile = {
  publicKey: string;
  username: string;
  description: string;
  avatarMint: string;
};

export default function UsersPage() {
  const { connection } = useConnection();
  const { clusterLabel } = useSolanaNetwork();
  const [profiles, setProfiles] = useState<Profile[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!connection) {
      return;
    }

    (async () => {
      try {
        const [anchor, { default: sdk }] = await Promise.all([
          import("@coral-xyz/anchor"),
          import("avatars-sdk/profile"),
        ]);
        const provider = new anchor.AnchorProvider(
          connection,
          (window as any).solana,
          anchor.AnchorProvider.defaultOptions()
        );
        const program = new anchor.Program(sdk.idlJson as any, provider) as any;

        const accounts = await program.account.userProfile.all();

        const decoded = accounts.map(({ publicKey, account }: any) => ({
          publicKey: publicKey.toBase58(),
          username: decodeByteArray(account.username),
          description: decodeByteArray(account.description),
          avatarMint: account.avatarMint.toString(),
        }));
        setProfiles(decoded);
      } catch (loadError) {
        console.error("Failed to load profiles:", loadError);
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not read profiles from this cluster."
        );
        setProfiles([]);
      }
    })();
  }, [connection]);

  const isLoading = profiles === null;

  return (
    <Page>
      <PageHeader
        eyebrow="Directory"
        title="Everyone with a profile here."
        lede="Profile accounts discovered on the selected cluster, with the avatar mint each of them points to."
        meta={
          <>
            <Meta label="Network" value={clusterLabel} />
            <Meta
              label="Profiles"
              value={isLoading ? "—" : profiles.length}
            />
          </>
        }
      />

      <div className="mt-8">
        {isLoading ? (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((key) => (
              <div key={key} className="ui-card p-5" aria-busy="true">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="mt-3 h-6 w-2/3" />
                <Skeleton className="mt-4 h-3 w-full" />
                <Skeleton className="mt-2 h-3 w-4/5" />
                <Skeleton className="mt-5 h-16 w-full" />
              </div>
            ))}
          </div>
        ) : profiles.length === 0 ? (
          <EmptyState
            title={error ? "Could not load profiles" : "No profiles yet"}
            description={
              error ??
              "Nobody has created a profile on this cluster. Be the first one."
            }
            action={
              <a href="/web3/profile" className="ui-button">
                Create a profile
              </a>
            }
          />
        ) : (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {profiles.map((profile) => (
              <Card
                key={profile.publicKey}
                className="flex h-full flex-col p-5"
              >
                <div className="ui-label">Username</div>
                <h2 className="ui-h2 mt-1.5 break-words">
                  {profile.username || "Unnamed"}
                </h2>
                <p className="ui-copy-sm mt-3">
                  {profile.description || "No bio."}
                </p>
                <DataList
                  className="mt-5 border-t border-[rgb(var(--line))] pt-1"
                  items={[
                    { label: "Avatar mint", value: profile.avatarMint },
                    { label: "Profile PDA", value: profile.publicKey },
                  ]}
                />
              </Card>
            ))}
          </div>
        )}
      </div>
    </Page>
  );
}
