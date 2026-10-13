import 'dotenv/config';
import app from './app';

// En Vercel la app se exporta como función serverless; listen solo en local u otros hosts.
if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Backend corriendo en http://localhost:${PORT}`);
  });
}

export default app;
