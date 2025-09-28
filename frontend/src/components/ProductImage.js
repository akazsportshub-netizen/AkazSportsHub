import React, { useState } from 'react';

const ProductImage = ({ product, className = "", size = "large" }) => {
  const [imageError, setImageError] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);

  const sizeClasses = {
    small: "w-16 h-16",
    medium: "w-20 h-20", 
    large: "w-24 h-24"
  };

  const getBrandColor = (brand) => {
    switch (brand) {
      case 'GOWIN': return 'bg-green-600';
      case 'TRIUMPH': return 'bg-red-600';
      case 'BABBLER': return 'bg-purple-600';
      case 'CAPTAIN': return 'bg-orange-600';
      default: return 'bg-gray-600';
    }
  };

  const getPlaceholderImage = () => {
    // Using a placeholder service that generates images based on text
    const text = `${product.brand}+${product.name.replace(/\s+/g, '+')}`;
    return `https://via.placeholder.com/400x400/E5E7EB/6B7280?text=${text}`;
  };

  const handleImageError = () => {
    setImageError(true);
    setImageLoading(false);
  };

  const handleImageLoad = () => {
    setImageLoading(false);
  };

  // If we have product images and no error, try to load the first one
  const primaryImage = product.images && product.images.length > 0 ? product.images[0] : null;

  if (imageError || !primaryImage) {
    // Show branded placeholder
    return (
      <div className={`${className} bg-gradient-to-br from-gray-100 to-gray-200 rounded-lg flex items-center justify-center relative overflow-hidden`}>
        <div className="text-center">
          <div className={`${sizeClasses[size]} mx-auto mb-2 rounded-lg flex items-center justify-center text-white font-bold ${
            size === 'small' ? 'text-lg' : size === 'medium' ? 'text-xl' : 'text-2xl'
          } ${getBrandColor(product.brand)}`}>
            {product.brand.charAt(0)}
          </div>
          <span className="text-gray-600 text-xs font-medium block">{product.brand}</span>
          <div className="text-gray-500 text-xs mt-1">{product.model_code}</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${className} bg-gradient-to-br from-gray-100 to-gray-200 rounded-lg relative overflow-hidden`}>
      {imageLoading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      )}
      <img
        src={getPlaceholderImage()}
        alt={`${product.brand} ${product.name}`}
        className="w-full h-full object-cover"
        onError={handleImageError}
        onLoad={handleImageLoad}
        style={{ display: imageLoading ? 'none' : 'block' }}
      />
      {/* Brand overlay */}
      <div className="absolute top-2 left-2">
        <div className={`w-8 h-8 rounded-md flex items-center justify-center text-white font-bold text-sm ${getBrandColor(product.brand)}`}>
          {product.brand.charAt(0)}
        </div>
      </div>
    </div>
  );
};

export default ProductImage;