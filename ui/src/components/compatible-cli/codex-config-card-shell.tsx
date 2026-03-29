import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface CodexConfigCardShellProps {
  title: string;
  icon?: ReactNode;
  badge?: string;
  description?: string;
  disabledReason?: string | null;
  children: ReactNode;
}

export function CodexConfigCardShell({
  title,
  icon,
  badge,
  description,
  disabledReason,
  children,
}: CodexConfigCardShellProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          {icon}
          {title}
          {badge ? (
            <Badge variant="outline" className="text-[10px] font-normal">
              {badge}
            </Badge>
          ) : null}
        </CardTitle>
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      </CardHeader>
      <CardContent className="space-y-3">
        {disabledReason ? <p className="text-xs text-amber-600">{disabledReason}</p> : null}
        {children}
      </CardContent>
    </Card>
  );
}
