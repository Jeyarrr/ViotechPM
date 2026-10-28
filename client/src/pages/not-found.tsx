import { Link } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function NotFoundPage() {
  return (
    <div className="future-page">
      <span className="eyebrow">404 · PAGE NOT FOUND</span>
      <h1>This page is off the map.</h1>
      <p>Let’s get you back to your workspace.</p>
      <Button asChild variant="secondary">
        <Link to="/">
          <ArrowLeft size={16} />
          Back to overview
        </Link>
      </Button>
    </div>
  );
}
