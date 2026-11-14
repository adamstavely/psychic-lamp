import type { Routes } from '@angular/router';
import { autoLoginPartialRoutesGuard } from 'angular-auth-oidc-client';
import { Shell } from './shell/shell';

const placeholder = () => import('./features/placeholder/placeholder-page');

export const routes: Routes = [
  // angular-auth-oidc-client sends a failed sign-in here.
  {
    path: 'unauthorized',
    title: "Couldn't sign in",
    loadComponent: () => import('./features/sign-in-failed/sign-in-failed-page'),
  },
  {
    path: '',
    component: Shell,
    canActivate: [autoLoginPartialRoutesGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'brief' },
      { path: 'brief', title: 'Daily Brief', loadComponent: () => import('./features/brief/brief-page') },
      { path: 'chats', title: 'Chats', loadComponent: () => import('./features/chats/chats-home-page') },
      { path: 'chats/new', title: 'New chat', loadComponent: () => import('./features/chats/chats-home-page') },
      { path: 'chats/:chatId', title: 'Chat', loadComponent: () => import('./features/chats/chat-page') },
      { path: 'projects', title: 'Projects', loadComponent: placeholder, data: { heading: 'Projects' } },
      { path: 'artifacts', title: 'Artifacts', loadComponent: placeholder, data: { heading: 'Artifacts' } },
      { path: '**', title: 'Page not found', loadComponent: () => import('./features/not-found/not-found-page') },
    ],
  },
];
