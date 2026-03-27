import { useEffect, useState } from "react";
import Header from "~/components/header";
import { Connection, clusterApiUrl } from "@solana/web3.js";
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
      const program = new anchor.Program(sdk.idlJson as any, provider);

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
    <div className="w-full h-screen overflow-hidden">
      <div className="p-8 overflow-auto h-full">
        <h2 className="text-xl font-semibold mb-2">All Created Profiles:</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
          {profiles.map((p) => (
            <div key={p.publicKey} className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 flex flex-col justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{p.username}</h3>
                <p className="text-gray-700 dark:text-gray-300 mt-1">{p.description}</p>
                <p className="text-xs text-gray-500 mt-4 break-words">Avatar Mint: {p.avatarMint}</p>
              </div>
              <p className="text-xs text-gray-500 mt-4 break-words">pda pubkey: {p.publicKey}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
