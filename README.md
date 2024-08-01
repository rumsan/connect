# Rumsan Connect

Rumsan connect is an communication hub that registers external services like SMS, Email, Asterisk (Voice), Slack, WhatsApp. It has a uniform method to broadcast messages to recepients. It has a built in queue and scheduling services to ensure all the messages are delivered successfully.

## Start the application

Run `npx nx serve connect` to start the development server.

## Build for production

Run `npx nx build connect` to build the application. The build artifacts are stored in the output directory (e.g. `dist/` or `build/`), ready to be deployed.

## Running tasks

To execute tasks with Nx use the following syntax:

```
npx nx <target> <project> <...options>
```

You can also run multiple targets:

```
npx nx run-many -t <target1> <target2>
```

..or add `-p` to filter specific projects

```
npx nx run-many -t <target1> <target2> -p <proj1> <proj2>
```

Targets can be defined in the `package.json` or `projects.json`. Learn more [in the docs](https://nx.dev/features/run-tasks).

## Connect with us!

- [Join the community](https://rumsan.com)
- [Follow us on LinkedIn](https://www.linkedin.com/company/rumsan)
