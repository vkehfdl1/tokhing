"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Navigation() {
    const pathname = usePathname();

    const links = [
        { href: '/', label: '오늘의 예측' },
        { href: '/history', label: '기록' },
        { href: '/leaderboard', label: '순위' },
        { href: '/admin', label: '프런트' },
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
