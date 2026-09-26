import { mount } from 'svelte';
import './styles/app.css';
import App from './App.svelte';
import { themes } from './lib/themes.svelte';
import './lib/perf';   // ?perf: the performance numbers (ADR 0058)

themes.init();   // before the first paint

export default mount(App, { target: document.getElementById('app')! });
