import Link from "next/link";
import { Container } from "@/components/ui/Container";

const COLUMNS = [
  {
    heading: "BOOK",
    links: [
      { href: "/book", label: "Book a chair" },
      { href: "/services", label: "Services" },
      { href: "/barbers", label: "Barbers" },
    ],
  },
  {
    heading: "ACCOUNT",
    links: [
      { href: "/account", label: "Dashboard" },
      { href: "/account/rewards", label: "Rewards" },
      { href: "/account/bookings", label: "Booking history" },
    ],
  },
  {
    heading: "SHOP",
    links: [
      { href: "/#location", label: "Jeddah / Abhur" },
      { href: "/login", label: "Staff sign in" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="hairline-t bg-ink-950 py-16">
      <Container wide>
        <div className="grid gap-12 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <span className="font-display text-2xl tracking-wide text-paper">SPLIT CUTS</span>
            <p className="mt-4 max-w-xs font-sans text-sm text-ink-400">
              Cuts. Braids. Twists. Dreads. Built for Jeddah.
            </p>
          </div>
          {COLUMNS.map((col) => (
            <div key={col.heading}>
              <p className="tag-number text-ink-600">{col.heading}</p>
              <ul className="mt-4 space-y-3">
                {col.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="font-sans text-sm text-ink-200 hover:text-paper"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="hairline-t mt-14 flex flex-col gap-3 pt-8 font-sans text-xs text-ink-600 md:flex-row md:items-center md:justify-between">
          <span>© {new Date().getFullYear()} Split Cuts. All rights reserved.</span>
          <span>Jeddah / Abhur, Saudi Arabia</span>
        </div>
      </Container>
    </footer>
  );
}
