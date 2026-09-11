import { Link } from "@remix-run/react";
import {
  Badge,
  Card,
  Notice,
  Page,
  PageHeader,
  Section,
} from "~/components/ui";
import { LEGACY_TOOLS } from "~/lib/routes";

const descriptions: Record<(typeof LEGACY_TOOLS)[number]["to"], string> = {
  "/web3/profile":
    "The original wallet-based profile: username, bio and avatar NFT on Solana.",
  "/minter": "Browse legacy collections and mint NFTs with your wallet.",
  "/deployer":
    "Deploy a legacy avatar collection with supply and mint settings.",
  "/users": "Browse the existing on-chain profile registry.",
};

export default function Web3() {
  return (
    <Page>
      <PageHeader
        eyebrow="Ekza · Optional research area"
        title="Web3 experiments"
        lede="Separate from your Ekza account. These earlier Solana tools are preserved for experimentation; you do not need them to publish, save or use avatars in Studio."
        actions={<Badge tone="warning">Experimental</Badge>}
      />
      <div className="mt-6">
        <Notice>
          A wallet is not yet linked to your email account. Minting an NFT here
          does not automatically add or approve a model in the Studio catalog.
          Network fees may apply; verify the selected network before signing.
        </Notice>
      </div>
      <Section title="Preserved Solana tools">
        <div className="grid gap-5 sm:grid-cols-2">
          {LEGACY_TOOLS.map((tool) => (
            <Card key={tool.to} className="flex flex-col gap-4 p-5">
              <h2 className="ui-h3">{tool.label}</h2>
              <p className="ui-copy-sm">{descriptions[tool.to]}</p>
              <Link to={tool.to} className="ui-link mt-auto">
                Open experiment →
              </Link>
            </Card>
          ))}
        </div>
      </Section>
      <Link to="/studio" className="ui-button mt-8">
        Back to Avatar Studio
      </Link>
    </Page>
  );
}
