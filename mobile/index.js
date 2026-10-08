// The background task MUST be defined at the top level, before the app registers.
import './src/location/task';
import { registerRootComponent } from 'expo';
import App from './App';

registerRootComponent(App);
