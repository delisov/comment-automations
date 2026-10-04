import { Link } from 'react-router';
import { Empty } from './ui.js';

export const NotFoundPage = () => (
  <Empty
    title="Page not found"
    text="There is nothing at this address."
    action={
      <Link to="/" className="btn sec">
        Back to DM automations
      </Link>
    }
  />
);
