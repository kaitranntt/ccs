/**
 * Analytics Skeleton Component
 *
 * Loading skeleton for the analytics page.
 */

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export function AnalyticsSkeleton() {
  return (
    <div className="flex-1 flex flex-col min-h-0 gap-4">
      {/* Usage Trends Skeleton - Takes most space */}
      <Card className="flex flex-col flex-[2] min-h-[250px]">
        <CardHeader className="p-4 pb-2">
          <Skeleton className="h-4 w-32" />
        </CardHeader>
        <CardContent className="p-4 pt-0 flex-1">
          <Skeleton className="h-full w-full" />
        </CardContent>
      </Card>

      {/* Bottom Row Skeletons - Fixed height with original column layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-10 gap-4 h-[240px] shrink-0">
        {/* Cost Breakdown Skeleton - 4 cols */}
        <Card className="flex flex-col h-full overflow-hidden lg:col-span-4">
          <CardHeader className="p-4 pb-2">
            <Skeleton className="h-4 w-28" />
          </CardHeader>
          <CardContent className="p-4 pt-2 flex-1 overflow-hidden">
            <div className="space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <Skeleton className="w-2 h-2 rounded-full" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                  <Skeleton className="h-3 w-14" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Model Usage Skeleton - 2 cols */}
        <Card className="flex flex-col h-full overflow-hidden lg:col-span-2">
          <CardHeader className="p-4 pb-2">
            <Skeleton className="h-4 w-24" />
          </CardHeader>
          <CardContent className="p-4 pt-0 flex-1 flex items-center justify-center">
            <Skeleton className="h-[80px] w-[80px] rounded-full" />
          </CardContent>
        </Card>

        {/* Session Stats Skeleton - 2 cols */}
        <Card className="flex flex-col h-full overflow-hidden lg:col-span-2">
          <CardHeader className="p-4 pb-2">
            <Skeleton className="h-4 w-24" />
          </CardHeader>
          <CardContent className="p-4 pt-0 flex-1">
            <Skeleton className="h-full w-full" />
          </CardContent>
        </Card>

        {/* CLIProxy Stats Skeleton - 2 cols */}
        <Card className="flex flex-col h-full overflow-hidden lg:col-span-2">
          <CardHeader className="p-4 pb-2">
            <Skeleton className="h-4 w-28" />
          </CardHeader>
          <CardContent className="p-4 pt-0 flex-1">
            <Skeleton className="h-full w-full" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
