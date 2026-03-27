import { PageSection, Panel, StatCard } from "~/components/ui";

export default function About() {
  return (
    <PageSection
      eyebrow="Project Brief"
      title="Identity, minting, and metaverse presence in one Solana app"
      description="Ekza Space turns avatars into portable, ownable web3 identity objects. The interface now explains that story more clearly while keeping the same flows for profiles, deployment, and marketplace minting."
    >
      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <Panel className="space-y-6">
          <img
            src="/logo.jpg"
            alt="Ekza Space Logo"
            className="h-40 w-40 rounded-[28px] border border-[rgba(var(--line),0.6)] object-cover"
          />

          <div className="space-y-4">
            <h2 className="font-display text-2xl font-semibold tracking-tight text-[rgb(var(--text-strong))]">
              What this product does
            </h2>
            <p className="ui-copy">
              Ekza Space sits at the intersection of digital identity and
              creative ownership. Users can create a profile, attach an NFT
              avatar, deploy their own collection, and mint from other creators
              inside the same product surface.
            </p>
            <p className="ui-copy">
              The long-term vision is portable identity for decentralized apps
              and metaverse environments: personal, interoperable, and
              economically meaningful.
            </p>
          </div>
        </Panel>

        <div className="grid gap-6">
          <StatCard label="Profile" value="Create / Update" hint="Bind username, bio, and selected avatar NFT." />
          <StatCard label="Deploy" value="Mint Collection" hint="Publish your own 3D avatar collection on devnet." />
          <StatCard label="Market" value="Explore / Mint" hint="Browse creator drops and mint directly from the UI." />
        </div>
      </div>

      <Panel className="mt-6">
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-3">
            <div className="ui-label">Quick Guide</div>
            <h3 className="font-display text-2xl font-semibold tracking-tight text-[rgb(var(--text-strong))]">
              Main routes
            </h3>
          </div>
          <div className="grid gap-4">
            <p className="ui-copy"><strong className="text-[rgb(var(--text-strong))]">Profile:</strong> configure your on-chain persona and pick an avatar you already own.</p>
            <p className="ui-copy"><strong className="text-[rgb(var(--text-strong))]">Users:</strong> inspect the profiles currently registered on devnet.</p>
            <p className="ui-copy"><strong className="text-[rgb(var(--text-strong))]">Deploy:</strong> upload a model, configure metadata, and initialize a collection.</p>
            <p className="ui-copy"><strong className="text-[rgb(var(--text-strong))]">Market:</strong> browse shared avatar drops, preview 3D models, and mint what fits your style.</p>
            <p className="ui-copy"><strong className="text-[rgb(var(--text-strong))]">Ekza Space:</strong> jump to the metaverse playground and try your identity in motion.</p>
          </div>
        </div>
      </Panel>
    </PageSection>
  );
}