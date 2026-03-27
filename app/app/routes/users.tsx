import { useEffect, useState } from "react";
import { Connection, clusterApiUrl } from "@solana/web3.js";

import { Badge, PageSection, Panel } from "~/components/ui";
import { decodeByteArray } from "~/utils/bytes";

export default function IndexPage() {
  const [profiles, setProfiles] = useState<
    { publicKey: string; username: string; description: string; avatarMint: string }[]
  >([]);

  useEffect(() => {
    (async () => {
      const [anchor, { default: sdk }] = await Promise.all([
        import("@coral-xyz/anchor"),
        import("avatars-sdk/profile"),
      ]);
      const connection = new Connection(clusterApiUrl("devnet"));
      const provider = new anchor.AnchorProvider(connection, (window as any).solana, anchor.AnchorProvider.defaultOptions());
      const program = new anchor.Program(sdk.idlJson as any, provider) as any;

      const accounts = await program.account.userProfile.all();

      const decoded = accounts.map(({ publicKey, account }: any) => ({
        publicKey: publicKey.toBase58(),
        username: decodeByteArray(account.username),
        description: decodeByteArray(account.description),
        avatarMint: account.avatarMint.toString(),
      }));
      setProfiles(decoded);
    })();
  }, []);

  return (
    <PageSection
      eyebrow="Profiles Registry"
      title="Explore created user profiles"
      description="A cleaner directory view for all discovered on-chain profiles. Same data, much better scanability."
      actions={<Badge>{profiles.length} loaded</Badge>}
    >
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {profiles.map((p) => (
          <Panel key={p.publicKey} className="flex h-full flex-col justify-between gap-5">
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="ui-label">Username</div>
                  <h2 className="font-display text-2xl font-semibold tracking-tight text-[rgb(var(--text-strong))]">
                    {p.username || "Unnamed"}
                  </h2>
                </div>
                <Badge>Profile</Badge>
              </div>
              <p className="ui-copy min-h-[84px]">{p.description || "No bio provided yet."}</p>
            </div>

            <div className="space-y-3 border-t border-[rgba(var(--line),0.5)] pt-4">
              <div>
                <div className="ui-label">Avatar Mint</div>
                <p className="break-all font-mono text-xs text-[rgb(var(--text-strong))]">
                  {p.avatarMint}
                </p>
              </div>
              <div>
                <div className="ui-label">Profile PDA</div>
                <p className="break-all font-mono text-xs text-[rgb(var(--text))]">
                  {p.publicKey}
                </p>
              </div>
            </div>
          </Panel>
        ))}
      </div>
    </PageSection>
  );
}
