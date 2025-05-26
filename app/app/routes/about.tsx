export default function About() {
  return (
    <main className="min-h-screen flex items-start justify-center bg-white px-6">
      <div className="max-w-3xl text-justify space-y-6">
        <img src="/logo.jpg" alt="Ekza Space Logo" className="mx-auto mb-6 w-64 h-64" />
        <h1 className="text-4xl font-bold text-gray-900">About Ekza Space and Avatar Minter</h1>
        <p className="text-lg text-gray-700">
          Ekza Space is a pioneering platform at the intersection of digital identity and creative expression in the Web3 era. At its core is the Avatar Minter, a tool that empowers users to create and own fully customizable 3D avatars, minted as NFTs and ready to use across metaverses and decentralized applications.
        </p>
        <p className="text-lg text-gray-700">
          Inspired by the vision of <em>Ready Player One</em>, Ekza Space envisions a future where digital presence is personal, interoperable, and economically empowering. By leveraging blockchain technology, it enables true ownership, portability, and monetization of digital assets—reshaping how users interact, play, and create in the evolving digital landscape.
        </p>
        <h2 className="text-2xl font-semibold text-gray-800 mt-10">Quick Guide</h2>

        <p className="text-lg text-gray-700">
          On the <strong>Home</strong> page, you can configure your appearance and style in a 3D Web3 metaverse space.
        </p>

        <p className="text-lg text-gray-700">
          Visit the <strong>Users</strong> page to see all registered users who have created profiles.
        </p>

        <p className="text-lg text-gray-700">
          On the <strong>Deployer</strong> page, you can create your own NFT minter where others can mint NFTs based on your 3D model. You can also specify a commission, which you can later claim as rewards when users purchase your avatars (in progress).
        </p>

        <p className="text-lg text-gray-700">
          The <strong>Minter</strong> page is an open market where you can discover avatars shared by other creators. Choose the ones that suit your style and budget.
        </p>

        <p className="text-lg text-gray-700">
          Finally, the <strong>Ekza</strong> page links to the Ekza metaverse playground, where you can test your avatar, meet other users, and see them moving in real time.
        </p>
      </div>
    </main>
  )
}