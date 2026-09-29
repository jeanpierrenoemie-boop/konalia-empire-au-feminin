export function LandingNav() {
  return (
    <nav className="border-b">
      <div className="container mx-auto flex justify-between items-center py-4">
        <div className="text-xl font-bold">NAIOM</div>
        <div className="flex gap-4">
          <a href="/bases" className="hover:underline">Bases</a>
          <a href="/live" className="hover:underline">Live</a>
          <a href="/dashboard" className="hover:underline">Dashboard</a>
        </div>
      </div>
    </nav>
  );
}
