import { Shell } from '../../components/shell';

/**
 * Wraps every signed-in route. `/login` sits outside this group so it renders
 * standalone, without the sidebar and breadcrumb.
 */
export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-0 focus:top-0 focus:z-50 focus:rounded-br-md focus:bg-primary focus:px-4 focus:py-2.5 focus:font-semibold focus:text-primary-foreground"
      >
        Skip to main content
      </a>
      <Shell>{children}</Shell>
    </>
  );
}
