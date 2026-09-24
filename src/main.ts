import { mount } from 'svelte';
import './styles/app.css';
import App from './App.svelte';

export default mount(App, { target: document.getElementById('app')! });
