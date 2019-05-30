# C# Constructor Generator for VSCode

## Example

From:

```csharp
namespace MySample
{
    class Hoge
    {
        public int Foo { get; }

        private readonly string _bar;

        public Hoge(int foo, string bar)
        {
            Foo = foo;
            _bar = bar;
        }
    }
}
```

To:

```csharp
namespace MySample
{
    class Hoge
    {
        public int Foo { get; }

        private readonly string _bar;

        public Hoge(int foo, string bar)
        {
            Foo = foo;
            _bar = bar;
        }
    }
}
```

- Different from [csharpextensions](https://github.com/jchannon/csharpextensions):
    - Support `sealed class` and `struct`
    - Not generate assignments for fields/proeprties with initializer
    - Alway generate `public` constructor
