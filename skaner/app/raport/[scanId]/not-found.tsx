export default function NotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-gray-900 mb-2">
          Raport nie znaleziony
        </h1>
        <p className="text-gray-500 mb-6">
          Ten raport mógł wygasnąć (raporty są dostępne przez 30 dni)
          lub link jest nieprawidłowy.
        </p>
        <a
          href="/"
          className="inline-block px-6 py-2.5 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition-colors"
        >
          Uruchom nowy skan
        </a>
      </div>
    </main>
  );
}
