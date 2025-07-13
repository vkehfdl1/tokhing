"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Navigation() {
    const pathname = usePathname();

    const links = [
        { href: '/', label: 'Home' },
        { href: '/history', label: 'History' },
        { href: '/leaderboard', label: 'Leaderboard' },
    ];

    return (
        <nav className="bg-gray-100 p-4 mb-8 rounded-lg shadow-sm">
            <ul className="flex justify-center gap-8">
                {links.map(link => (
                    <li key={link.href}>
                        <Link href={link.href} className={`text-lg font-semibold pb-1 ${pathname === link.href ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-600 hover:text-blue-500'}`}>
                            {link.label}
                        </Link>
                    </li>
                ))}
            </ul>
        </nav>
    );
}
