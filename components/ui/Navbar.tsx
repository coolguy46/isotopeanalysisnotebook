import React from 'react';
import Link from 'next/link';

const Navbar = () => (
  <nav className="bg-white border-b shadow-sm">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="flex justify-between items-center py-4">
        <div className="flex items-center space-x-6">
          <Link href="/" className="text-lg font-bold text-blue-700 hover:text-blue-900">Dashboard</Link>
          <Link href="/statistics" className="text-lg font-bold text-blue-700 hover:text-blue-900">Statistics & Graphs</Link>
        </div>
      </div>
    </div>
  </nav>
);

export default Navbar;
