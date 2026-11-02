# Code Naming Conventions

Since all code in typescript is mostly a class, method, variable, or function, we use specific case semantics so that reading code is much easier.

- **let some_var:** Variable names use snake_case.
- **FunctionName:** Individual functions use pascal case.
- **let some_class = new SomeClass:** Class names are pascal case.
- **some_class.someMethod:** Method names are camel case.

Be aware that this is what we use, not what other librarys that we use, use.

# Types/Interfaces/Typescript

- **typename_t:** typenames are affixed with \_t.
- **interfacename_i:** interfaces are affixed with \_i.

# Runtime Schema Validation

- **sometypename_t_zods:** Zod type schemas are defined by matching their type, along with \_zods.
