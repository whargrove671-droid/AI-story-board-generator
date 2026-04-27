'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader as Loader2, Terminal } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { toast } = useToast();
  const supabase = createClient();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      toast({
        title: 'ERR.AUTH_FAILED',
        description: error.message.toUpperCase(),
        variant: 'destructive',
      });
      setLoading(false);
    } else {
      toast({
        title: 'SYS.AUTH_SUCCESS',
        description: 'ACCESS GRANTED. REROUTING TO DASHBOARD...',
      });
      router.push('/dashboard');
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center bg-transparent p-4 relative z-10">
      <Card className="w-full max-w-md bg-black border border-cyan-900/50 shadow-[0_0_30px_rgba(6,182,212,0.15)] rounded-sm overflow-hidden">
        <CardHeader className="space-y-1 border-b border-cyan-900/50 bg-gradient-to-r from-black via-zinc-950 to-black pb-6">
          <div className="flex items-center justify-center mb-4">
            <div className="p-3 border border-cyan-500 bg-cyan-950/30 shadow-[0_0_15px_rgba(6,182,212,0.5)] rounded-none">
              <Terminal className="h-8 w-8 text-cyan-400 drop-shadow-[0_0_8px_rgba(6,182,212,0.8)]" />
            </div>
          </div>
          <CardTitle className="text-2xl font-mono font-bold text-center tracking-widest text-cyan-400 drop-shadow-[0_0_8px_rgba(6,182,212,0.5)] uppercase">SYS_AUTH // LOGIN</CardTitle>
          <CardDescription className="text-center font-mono text-xs text-cyan-700 tracking-widest uppercase">
            ENTER CREDENTIALS TO ACCESS NEURAL NET
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleLogin}>
          <CardContent className="space-y-4 pt-6 bg-black/90">
            <div className="space-y-2">
              <Label htmlFor="email" className="font-mono text-cyan-400 text-xs uppercase tracking-wider">USER_IDENTIFIER (EMAIL)</Label>
              <Input
                id="email"
                type="email"
                placeholder="OPERATIVE@MAINFRAME.NET"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
                className="bg-black/80 border-cyan-900/50 text-cyan-100/70 font-mono text-sm focus-visible:ring-cyan-500/50 focus-visible:border-cyan-500 rounded-none h-10"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="font-mono text-cyan-400 text-xs uppercase tracking-wider">SECURITY_KEY (PASSWORD)</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
                className="bg-black/80 border-cyan-900/50 text-cyan-100/70 font-mono text-sm focus-visible:ring-cyan-500/50 focus-visible:border-cyan-500 rounded-none h-10"
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col space-y-4 bg-black/90 pb-6 border-t border-cyan-900/30 pt-6">
            <Button type="submit" className="w-full bg-fuchsia-600/20 hover:bg-fuchsia-600/40 text-fuchsia-400 border border-fuchsia-500 shadow-[0_0_10px_rgba(192,38,211,0.3)] hover:shadow-[0_0_15px_rgba(192,38,211,0.5)] transition-all font-mono uppercase rounded-none" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {loading ? 'AUTHENTICATING...' : 'INITIATE_UPLINK'}
            </Button>
            <p className="text-xs text-center font-mono text-cyan-700 uppercase tracking-widest">
              UNREGISTERED ENTITY?{' '}
              <Link href="/signup" className="text-cyan-400 hover:text-cyan-300 hover:drop-shadow-[0_0_5px_rgba(6,182,212,0.8)] transition-all font-bold">
                REGISTER_NEW_USER
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
