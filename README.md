# Sanity Advanced Reference Array

A powerful replacement for Sanity's default reference array input that adds search, sorting, and bulk management capabilities.

## Features

- **🔍 Real-time Search**: Search across multiple document types with live filtering
- **📊 Multi-field Sorting**: Sort references by any field with ascending/descending control
- **⚡ Bulk Operations**: Add multiple items at once, remove all with danger mode
- **🔄 Duplicate Detection**: Automatically prevents duplicate references
- **🎨 Smart UI**: Adapts interface based on content state and user actions
- **🔒 Safety Features**: Danger mode protection for destructive operations

## Installation

```bash
npm install sanity-advanced-reference-array
```

## Usage

```javascript
import { AdvancedRefArray } from 'sanity-advanced-reference-array'

export default {
  name: 'myDocument',
  type: 'document',
  fields: [
    {
      name: 'references',
      title: 'References',
      type: 'array',
      of: [
        {
          type: 'reference',
          to: [
            { type: 'post' },
            { type: 'author' },
            { type: 'category' }
          ]
        }
      ],
      components: {
        input: AdvancedRefArray
      }
    }
  ]
}
```

## Features in Detail

### Search Functionality
- Type to search across all referenced document types
- Real-time filtering with instant results
- Search by document title or other searchable fields
- Clear visual feedback for search state

### Sorting Capabilities
- Sort by any field in the referenced documents
- Toggle between ascending and descending order
- Visual indicators for current sort state
- Maintains sort preferences during session

### Bulk Operations
- **Add Multiple**: Select and add multiple search results at once
- **Remove All**: Danger mode for clearing entire reference array
- **Duplicate Prevention**: Automatically filters out existing references

### Safety Features
- **Danger Mode**: Protected destructive operations
- **Confirmation States**: Clear visual feedback for dangerous actions
- **Undo Prevention**: Careful state management to prevent accidental data loss

## Configuration

The component automatically detects the schema types from your field configuration and provides search across all specified types.

### Custom Hooks

The component uses a custom `useSanityClient` hook. Make sure your project includes:

```javascript
// hooks/useSanityClient.js
import { useClient } from 'sanity'

export const useSanityClient = () => {
  return useClient({ apiVersion: '2023-01-01' })
}
```

## Requirements

- Sanity Studio v3+
- React 18+
- GROQ query support

## API Reference

### Props

The component accepts all standard Sanity input component props:

- `value`: Current array of references
- `onChange`: Callback for value changes
- `schemaType`: Schema type definition
- `renderDefault`: Default renderer function

### Schema Type Support

Works with any reference array field that specifies `to` types:

```javascript
{
  type: 'array',
  of: [
    {
      type: 'reference',
      to: [
        { type: 'document1' },
        { type: 'document2' }
        // ... more types
      ]
    }
  ]
}
```

## Styling

The component uses Sanity UI components and follows Sanity's design system. Custom styling can be applied through:

- CSS classes on container elements
- Sanity UI theme customization
- Component-level style overrides

## Contributing

Contributions are welcome! Please read our contributing guidelines and submit pull requests for any improvements.

## License

MIT License - see LICENSE file for details.

## Support

For issues and questions:
- Create an issue on GitHub
- Check existing issues for solutions
- Review the documentation

## Changelog

### v1.0.0
- Initial release
- Search functionality
- Sorting capabilities
- Bulk operations
- Safety features