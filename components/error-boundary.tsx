'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error in boundary:", error, errorInfo);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <Card className="bg-red-950/30 border border-dashed border-red-500/50 shadow-[0_0_20px_rgba(239,68,68,0.2)] rounded-none my-6">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2 text-red-400 font-mono uppercase tracking-wider drop-shadow-[0_0_8px_rgba(239,68,68,0.5)]">
              <AlertTriangle className="h-5 w-5" />
              SYS_ERR: Component Failure
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            <p className="text-sm font-mono text-red-300/80 mb-4">
              A critical error occurred in this component module. You can attempt to recover or refresh the application.
            </p>
            <Button
              onClick={this.handleRetry}
              variant="outline"
              className="bg-red-900/40 hover:bg-red-800/50 text-red-300 border-red-500 font-mono uppercase rounded-none"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Attempt Recovery
            </Button>
          </CardContent>
        </Card>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;