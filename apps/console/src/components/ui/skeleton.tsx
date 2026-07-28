import { cn } from '../../lib/utils';
import { Table, TableBody, TableCell, TableRow } from './table';

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} {...props} />;
}

/**
 * Placeholder rows for table loads. Preferred over a spinner because it
 * reserves the final layout, so arriving data doesn't shift the page.
 */
function TableSkeleton({ rows = 5, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading data…</span>
      <Table>
        <TableBody>
          {Array.from({ length: rows }).map((_, row) => (
            <TableRow key={row}>
              {Array.from({ length: columns }).map((__, col) => (
                <TableCell key={col}>
                  <Skeleton className={cn('h-3', col === 0 ? 'w-3/4' : 'w-1/2')} />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function CardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-52 rounded-lg" />
      ))}
    </div>
  );
}

export { Skeleton, TableSkeleton, CardGridSkeleton };
