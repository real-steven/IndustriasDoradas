import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { useState, type PropsWithChildren } from 'react';

import { createQueryClient } from './query-client';

interface QueryProviderProps extends PropsWithChildren {
  client?: QueryClient;
}

export function QueryProvider({ children, client }: QueryProviderProps) {
  const [defaultClient] = useState(createQueryClient);

  return (
    <QueryClientProvider client={client ?? defaultClient}>
      {children}
    </QueryClientProvider>
  );
}
