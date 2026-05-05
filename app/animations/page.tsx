import PendulumSim from "@/components/animations/PendulumSim";
import DoublePendulumSim from "@/components/animations/DoublePendulumSim";
import OrbitSim from "@/components/animations/OrbitSim";
import Link from "next/link";

export default function AnimationsPage() {
  return (
    <main className="max-w-4xl mx-auto px-6 py-10">
      <Link
        href="/"
        className="text-sm text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors mb-6 inline-block"
      >
        ← Back to home
      </Link>

      <header className="mb-10">
        <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 mb-3">
          Physics Animations
        </h1>
        <p className="text-lg text-zinc-500 dark:text-zinc-400">
          Interactive simulations built with Canvas. These components can be embedded directly in articles using MDX.
        </p>
      </header>

      <div className="space-y-16">
        {/* Pendulum */}
        <section>
          <h2 className="text-2xl font-semibold mb-4">Pendulum</h2>
          <p className="text-zinc-500 dark:text-zinc-400 mb-6">
            A simple pendulum simulation. Adjust length, gravity, initial angle, and damping.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-sm font-semibold mb-2">Default</h3>
              <PendulumSim />
            </div>
            <div>
              <h3 className="text-sm font-semibold mb-2">Longer, slower (L=2.5, g=5)</h3>
              <PendulumSim length={2.5} gravity={5} />
            </div>
            <div>
              <h3 className="text-sm font-semibold mb-2">High damping</h3>
              <PendulumSim damping={0.05} initialAngle={60} />
            </div>
            <div>
              <h3 className="text-sm font-semibold mb-2">Large angle (80°)</h3>
              <PendulumSim initialAngle={80} />
            </div>
          </div>
          <div className="mt-4 p-4 rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
            <p className="text-xs text-zinc-500 dark:text-zinc-400 font-mono">
              {`<PendulumSim length={1.5} gravity={9.81} initialAngle={30} damping={0.01} />`}
            </p>
          </div>
        </section>

        {/* Double Pendulum */}
        <section>
          <h2 className="text-2xl font-semibold mb-4">Double Pendulum</h2>
          <p className="text-zinc-500 dark:text-zinc-400 mb-6">
            A chaotic double pendulum system. The trail shows the path of the second bob.
          </p>
          <DoublePendulumSim />
          <div className="mt-4 p-4 rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
            <p className="text-xs text-zinc-500 dark:text-zinc-400 font-mono">
              {`<DoublePendulumSim mass1={1} mass2={1} length1={1.2} length2={1.0} gravity={9.81} />`}
            </p>
          </div>
        </section>

        {/* Orbit Simulation */}
        <section>
          <h2 className="text-2xl font-semibold mb-4">N-Body Orbit Simulation</h2>
          <p className="text-zinc-500 dark:text-zinc-400 mb-6">
            Gravitational simulation of multiple bodies. The default setup has 3 bodies in orbit.
          </p>
          <OrbitSim />
          <div className="mt-4 p-4 rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
            <p className="text-xs text-zinc-500 dark:text-zinc-400 font-mono">
              {`<OrbitSim G={6.674e-11} trail={true} />`}
            </p>
          </div>
        </section>

        {/* Usage Guide */}
        <section className="p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
          <h2 className="text-xl font-semibold mb-4">How to use in articles</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
            These components are automatically available in MDX content. Just import and use them in your article:
          </p>
          <pre className="text-xs bg-zinc-100 dark:bg-zinc-800 p-4 rounded-lg overflow-x-auto">
{`import PendulumSim from "@/components/animations/PendulumSim";
import DoublePendulumSim from "@/components/animations/DoublePendulumSim";
import OrbitSim from "@/components/animations/OrbitSim";

# My Physics Article

Here's a pendulum simulation:

<PendulumSim length={2} gravity={9.81} initialAngle={45} />

And a double pendulum:

<DoublePendulumSim />`}
          </pre>
        </section>
      </div>
    </main>
  );
}
